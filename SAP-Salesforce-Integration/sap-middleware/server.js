const express = require("express");
const cors    = require("cors");
require("dotenv").config();
const passport = require("passport");
const xssec    = require("@sap/xssec");
const xsenv    = require("@sap/xsenv");

const app  = express();
const PORT = process.env.PORT || 8080;

// Config from environment
const TABLE_NAME   = process.env.TABLE_NAME   || "EMPLOYEES";
const DEFAULT_ROLE = process.env.DEFAULT_ROLE || "Admin";
const DEPT_FINANCE = process.env.DEPT_FINANCE || "Finance";
const DEPT_HR      = process.env.DEPT_HR      || "HR";
const DEPT_SALES   = process.env.DEPT_SALES   || "Sales";
const DEPT_IT      = process.env.DEPT_IT      || "IT";

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-User-Role", "X-User-Email"]
}));
app.use(express.json());

// ============================================
// XSUAA SETUP
// ============================================
let xsuaaService = null;
try {
  xsenv.loadEnv();
  const services = xsenv.getServices({ xsuaa: { tag: "xsuaa" } });
  xsuaaService = services.xsuaa;
  const { JWTStrategy } = xssec;
  passport.use(new JWTStrategy(xsuaaService));
  app.use(passport.initialize());
  console.log("XSUAA initialized successfully!");
} catch (err) {
  console.warn("XSUAA not available:", err.message);
}

// ============================================
// HANA CONNECTION
// ============================================
const hana = require("@sap/hana-client");
const conn = hana.createConnection();

const connParams = {
  serverNode            : `${process.env.HANA_HOST}:${process.env.HANA_PORT}`,
  uid                   : process.env.HANA_USER,
  pwd                   : process.env.HANA_PASSWORD,
  encrypt               : "true",
  sslValidateCertificate: "false"
};

conn.connect(connParams, function(err) {
  if (err) {
    console.error("HANA connection failed:", err.message);
  } else {
    console.log("HANA connected successfully!");
    createTables();
  }
});

// ============================================
// CREATE TABLE
// ============================================
function createTables() {
  conn.exec(`
    CREATE TABLE ${TABLE_NAME} (
      ID         INTEGER,
      NAME       VARCHAR(50),
      DEPARTMENT VARCHAR(50),
      SALARY     INTEGER,
      LOCATION   VARCHAR(50)
    )
  `, function(err) {
    if (err && err.message.toLowerCase().includes("exists")) {
      console.log(`${TABLE_NAME} table already exists!`);
      insertEmployees();
    } else if (!err) {
      console.log(`${TABLE_NAME} table created!`);
      insertEmployees();
    } else {
      console.error("Create table error:", err.message);
    }
  });
}

// ============================================
// INSERT SAMPLE DATA
// ============================================
function insertEmployees() {
  conn.exec(`SELECT COUNT(*) AS CNT FROM ${TABLE_NAME}`, function(err, rows) {
    if (err) { console.error("Count error:", err.message); return; }
    if (rows[0].CNT === 0) {
      const employees = [
        `INSERT INTO ${TABLE_NAME} VALUES (1, 'Ravi Kumar',  '${DEPT_IT}',      50000, 'Bangalore')`,
        `INSERT INTO ${TABLE_NAME} VALUES (2, 'Priya Singh', '${DEPT_HR}',      45000, 'Mumbai')`,
        `INSERT INTO ${TABLE_NAME} VALUES (3, 'Amit Sharma', '${DEPT_FINANCE}', 60000, 'Delhi')`,
        `INSERT INTO ${TABLE_NAME} VALUES (4, 'Neha Patel',  '${DEPT_IT}',      55000, 'Bangalore')`,
        `INSERT INTO ${TABLE_NAME} VALUES (5, 'Suresh Babu', '${DEPT_SALES}',   40000, 'Chennai')`,
        `INSERT INTO ${TABLE_NAME} VALUES (6, 'Kavya Reddy', '${DEPT_FINANCE}', 65000, 'Hyderabad')`,
        `INSERT INTO ${TABLE_NAME} VALUES (7, 'Arjun Mehta', '${DEPT_HR}',      48000, 'Pune')`,
        `INSERT INTO ${TABLE_NAME} VALUES (8, 'Divya Nair',  '${DEPT_SALES}',   42000, 'Kochi')`
      ];
      employees.forEach(sql => {
        conn.exec(sql, function(err) {
          if (err) console.error("Insert error:", err.message);
        });
      });
      console.log("Sample data inserted!");
    } else {
      console.log("Data already exists!");
    }
  });
}

// ============================================
// ROLE BASED QUERY HELPER
// ============================================
function getRoleBasedQuery(role, question) {
  const q = question ? question.toLowerCase() : "";
  let sql = "";
  let description = "";

  if (role === DEPT_FINANCE) {
    sql = `SELECT ID, NAME, DEPARTMENT, SALARY, LOCATION FROM ${TABLE_NAME} WHERE DEPARTMENT = '${DEPT_FINANCE}' ORDER BY SALARY DESC`;
    description = `${DEPT_FINANCE} department data`;
  } else if (role === DEPT_HR) {
    if (q.includes("department") || q.includes("dept") || q.includes("count")) {
      sql = `SELECT DEPARTMENT, COUNT(*) AS HEADCOUNT FROM ${TABLE_NAME} GROUP BY DEPARTMENT ORDER BY HEADCOUNT DESC`;
      description = "Department headcount";
    } else {
      sql = `SELECT ID, NAME, DEPARTMENT, LOCATION FROM ${TABLE_NAME} ORDER BY NAME`;
      description = `All employees - ${DEPT_HR} view (salary hidden)`;
    }
  } else if (role === DEPT_SALES) {
    sql = `SELECT ID, NAME, DEPARTMENT, LOCATION FROM ${TABLE_NAME} WHERE DEPARTMENT = '${DEPT_SALES}'`;
    description = `${DEPT_SALES} team data`;
  } else if (role === DEPT_IT) {
    sql = `SELECT ID, NAME, DEPARTMENT, LOCATION FROM ${TABLE_NAME} WHERE DEPARTMENT = '${DEPT_IT}'`;
    description = `${DEPT_IT} team data`;
  } else {
    sql = `SELECT * FROM ${TABLE_NAME} ORDER BY DEPARTMENT, NAME`;
    description = `All employee data - ${DEFAULT_ROLE} view`;
  }

  return { sql, description };
}

// ============================================
// ROUTE 1 - Health check
// ============================================
app.get("/", (req, res) => {
  res.json({
    message : "SAP Middleware running!",
    status  : "ok",
    table   : TABLE_NAME,
    version : "1.0.0"
  });
});

// ============================================
// ROUTE 2 - Userinfo
// ============================================
app.get("/userinfo", (req, res) => {
  res.json({ status: "ok", message: "Middleware running", table: TABLE_NAME });
});

// ============================================
// ROUTE 3 - POST /ask (Pipedream calls this)
// ============================================
app.post("/ask", (req, res) => {
  const question  = req.body.question || "";
  const userRole  = req.headers["x-user-role"]  || req.body.role  || DEFAULT_ROLE;
  const userEmail = req.headers["x-user-email"] || req.body.email || "";

  console.log(`[ASK] User: ${userEmail} | Role: ${userRole} | Question: ${question}`);

  if (!question) {
    return res.status(400).json({ error: "Please send a question!" });
  }

  const { sql, description } = getRoleBasedQuery(userRole, question);
  console.log(`[SQL] ${sql}`);

  conn.exec(sql, function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      question    : question,
      role        : userRole,
      description : description,
      count       : rows.length,
      result      : rows
    });
  });
});

// ============================================
// ROUTE 4 - POST /api/query (Salesforce calls)
// ============================================
app.post("/api/query", (req, res) => {
  const queryType = req.body.queryType || "all";
  const userRole  = req.body.role || req.headers["x-user-role"] || DEFAULT_ROLE;
  const question  = req.body.question || queryType;

  console.log(`[QUERY] Role: ${userRole} | Type: ${queryType}`);

  const { sql, description } = getRoleBasedQuery(userRole, question);

  conn.exec(sql, function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      success     : true,
      queryType   : queryType,
      role        : userRole,
      description : description,
      count       : rows.length,
      data        : rows
    });
  });
});

// ============================================
// ROUTE 5 - GET /employees
// ============================================
app.get("/employees", (req, res) => {
  conn.exec(`SELECT * FROM ${TABLE_NAME}`, function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ table: TABLE_NAME, count: rows.length, result: rows });
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log("========================================");
  console.log(`SAP Middleware running on port ${PORT}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Default Role: ${DEFAULT_ROLE}`);
  console.log("========================================");
});
