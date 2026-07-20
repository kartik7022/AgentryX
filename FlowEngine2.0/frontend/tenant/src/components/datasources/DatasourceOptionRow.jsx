import { Tooltip } from "../primitives/Tooltip";

function datasourceText(source) {
  if (!source) return "";
  if (typeof source === "string") return source.toLowerCase();
  return [
    source.label,
    source.name,
    source.datasource_type,
    source.canonical_name,
    source.connection_key,
    source.driver_family,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function logoKey(source) {
  const text = datasourceText(source);
  if (text.includes("postgres") || text.includes("postgresql")) return "postgres";
  if (text.includes("mysql")) return "mysql";
  if (
    text.includes("mssql") ||
    text.includes("sql server") ||
    text.includes("sqlserver") ||
    text.includes("sql_server") ||
    text.includes("microsoft sql") ||
    text.includes("microsoftsqlserver")
  ) return "sqlserver";
  if (text.includes("oracle")) return "oracle";
  if (text.includes("snowflake")) return "snowflake";
  if (text.includes("bigquery") || text.includes("big query") || text.includes("google bigquery")) return "bigquery";
  if (text.includes("redshift") || text.includes("amazon redshift")) return "redshift";
  if (text.includes("mongo") || text.includes("mongodb")) return "mongodb";
  if (text.includes("salesforce")) return "salesforce";
  if (text.includes("servicenow") || text.includes("service now")) return "servicenow";
  if (text.includes("hubspot") || text.includes("hub spot")) return "hubspot";
  if (text.includes("slack")) return "slack";
  if (text.includes("s3") || text.includes("aws") || text.includes("amazon s3")) return "aws";
  if (text.includes("google drive") || text.includes("googledrive") || text.includes("drive")) return "gdrive";
  if (text.includes("api") || text.includes("rest")) return "api";
  if (text.includes("graphql")) return "graphql";
  if (text.includes("csv") || text.includes("file")) return "file";
  return "database";
}

const brandIconAssets = {
  postgres: {
    label: "PostgreSQL",
    url: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/postgresql/postgresql-original.svg",
    fallbackUrl: "https://cdn.simpleicons.org/postgresql/4169E1",
  },
  mysql: {
    label: "MySQL",
    url: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mysql/mysql-original.svg",
    fallbackUrl: "https://cdn.simpleicons.org/mysql/4479A1",
  },
  sqlserver: {
    label: "Microsoft SQL Server",
    url: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/microsoftsqlserver/microsoftsqlserver-original.svg",
    fallbackUrl: "https://cdn.simpleicons.org/microsoftsqlserver/CC2927",
  },
  oracle: {
    label: "Oracle",
    url: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/oracle/oracle-original.svg",
    fallbackUrl: "https://cdn.simpleicons.org/oracle/F80000",
  },
  snowflake: {
    label: "Snowflake",
    url: "https://cdn.simpleicons.org/snowflake/29B5E8",
  },
  bigquery: {
    label: "Google BigQuery",
    url: "https://cdn.simpleicons.org/googlebigquery/669DF6",
    fallbackUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/googlecloud/googlecloud-original.svg",
  },
  redshift: {
    label: "Amazon Redshift",
    url: "https://cdn.simpleicons.org/amazonredshift/8C4FFF",
    fallbackUrl: "https://cdn.simpleicons.org/amazonaws/232F3E",
  },
  mongodb: {
    label: "MongoDB",
    url: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mongodb/mongodb-original.svg",
    fallbackUrl: "https://cdn.simpleicons.org/mongodb/47A248",
  },
  salesforce: {
    label: "Salesforce",
    url: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/salesforce/salesforce-original.svg",
    fallbackUrl: "https://cdn.simpleicons.org/salesforce/00A1E0",
  },
  servicenow: {
    label: "ServiceNow",
    url: "https://cdn.simpleicons.org/servicenow/81B5A1",
  },
  hubspot: {
    label: "HubSpot",
    url: "https://cdn.simpleicons.org/hubspot/FF7A59",
  },
  slack: {
    label: "Slack",
    url: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/slack/slack-original.svg",
    fallbackUrl: "https://cdn.simpleicons.org/slack/4A154B",
  },
  aws: {
    label: "Amazon S3",
    url: "https://cdn.simpleicons.org/amazons3/569A31",
    fallbackUrl: "https://cdn.simpleicons.org/amazonaws/232F3E",
  },
  gdrive: {
    label: "Google Drive",
    url: "https://cdn.simpleicons.org/googledrive/4285F4",
  },
  graphql: {
    label: "GraphQL",
    url: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/graphql/graphql-plain.svg",
    fallbackUrl: "https://cdn.simpleicons.org/graphql/E10098",
  },
};

function brandIconUrl(key) {
  const asset = brandIconAssets[key];
  return asset?.url || "";
}

function BrandSvg({ children, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

function renderLogo(key, size) {
  switch (key) {
    case "postgres":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#336791" />
          <text x="16" y="20" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">PG</text>
        </BrandSvg>
      );
    case "mysql":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#00758f" />
          <circle cx="23.5" cy="9" r="3.5" fill="#f29111" />
          <text x="15" y="20" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">My</text>
        </BrandSvg>
      );
    case "sqlserver":
      return (
        <BrandSvg size={size}>
          <rect x="4" y="5" width="24" height="22" rx="8" fill="#cc2927" />
          <ellipse cx="16" cy="11" rx="8" ry="3.5" fill="#fff" opacity="0.92" />
          <path d="M8 11v10c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5V11" fill="none" stroke="#fff" strokeWidth="2" />
        </BrandSvg>
      );
    case "oracle":
      return (
        <BrandSvg size={size}>
          <rect x="3" y="8" width="26" height="16" rx="8" fill="#f80000" />
          <text x="16" y="19" textAnchor="middle" fontSize="6.3" fontWeight="800" fill="#fff">ORACLE</text>
        </BrandSvg>
      );
    case "snowflake":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#29b5e8" />
          <path d="M16 6v20M7.5 11l17 10M24.5 11l-17 10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="16" cy="16" r="3.2" fill="#fff" />
        </BrandSvg>
      );
    case "bigquery":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#f8fafc" stroke="#e2e8f0" />
          <rect x="8" y="15" width="4" height="8" rx="1.3" fill="#4285f4" />
          <rect x="14" y="10" width="4" height="13" rx="1.3" fill="#34a853" />
          <rect x="20" y="13" width="4" height="10" rx="1.3" fill="#fbbc05" />
          <path d="M9 9h14" stroke="#ea4335" strokeWidth="2.2" strokeLinecap="round" />
        </BrandSvg>
      );
    case "redshift":
      return (
        <BrandSvg size={size}>
          <path d="M16 3 28 10v12L16 29 4 22V10L16 3Z" fill="#8c4fff" />
          <path d="M16 7 24 12v8l-8 5-8-5v-8l8-5Z" fill="#ff9900" />
          <text x="16" y="19.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">R</text>
        </BrandSvg>
      );
    case "mongodb":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#e8f5e9" stroke="#c8e6c9" />
          <path d="M16 4c5 5.3 7.1 10.1 4.2 16.2-1.2 2.6-2.8 4.4-4.2 6.8-1.4-2.4-3-4.2-4.2-6.8C8.9 14.1 11 9.3 16 4Z" fill="#47a248" />
          <path d="M16 8v16" stroke="#2f7d32" strokeWidth="1.4" strokeLinecap="round" />
        </BrandSvg>
      );
    case "salesforce":
      return (
        <BrandSvg size={size}>
          <path d="M12 24c-4.5 0-8-2.8-8-6.4 0-2.9 2.2-5.4 5.5-6.2C11 8.8 14 7 17.4 7c4.7 0 8.6 3.5 8.6 7.8 2.3.6 4 2.4 4 4.6 0 2.6-2.4 4.6-5.4 4.6H12Z" fill="#00a1e0" />
          <text x="16.5" y="19.3" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff">sf</text>
        </BrandSvg>
      );
    case "servicenow":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#81b5a1" />
          <circle cx="16" cy="16" r="7" fill="#fff" />
          <circle cx="16" cy="16" r="3.6" fill="#293e40" />
        </BrandSvg>
      );
    case "hubspot":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#ff7a59" />
          <circle cx="12" cy="18" r="4" fill="#fff" />
          <circle cx="22" cy="10" r="3" fill="#fff" />
          <path d="M15 16l5-4M10 14V8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </BrandSvg>
      );
    case "slack":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#f8fafc" stroke="#e2e8f0" />
          <rect x="8" y="14" width="16" height="4" rx="2" fill="#36c5f0" />
          <rect x="14" y="8" width="4" height="16" rx="2" fill="#2eb67d" />
          <rect x="10" y="9" width="4" height="10" rx="2" transform="rotate(-90 12 14)" fill="#ecb22e" />
          <rect x="18" y="13" width="4" height="10" rx="2" transform="rotate(-90 20 18)" fill="#e01e5a" />
        </BrandSvg>
      );
    case "aws":
      return (
        <BrandSvg size={size}>
          <rect x="3" y="5" width="26" height="22" rx="8" fill="#232f3e" />
          <text x="16" y="17" textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">AWS</text>
          <path d="M10 21c3.8 2 8.2 2 12 0" stroke="#ff9900" strokeWidth="2" strokeLinecap="round" />
        </BrandSvg>
      );
    case "gdrive":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#f8fafc" stroke="#e2e8f0" />
          <path d="M14 5h5l8 14h-6L14 5Z" fill="#0f9d58" />
          <path d="M5 19 13 5l3 5-5 9H5Z" fill="#4285f4" />
          <path d="M11 19h16l-3 5H8l3-5Z" fill="#f4b400" />
        </BrandSvg>
      );
    case "api":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#2563eb" />
          <path d="M11 11h10M11 16h10M11 21h6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </BrandSvg>
      );
    case "graphql":
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#e535ab" />
          <path d="M16 7 24 12v8l-8 5-8-5v-8l8-5Z" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="16" cy="7" r="2" fill="#fff" />
          <circle cx="24" cy="12" r="2" fill="#fff" />
          <circle cx="8" cy="20" r="2" fill="#fff" />
        </BrandSvg>
      );
    case "file":
      return (
        <BrandSvg size={size}>
          <rect x="7" y="4" width="18" height="24" rx="4" fill="#64748b" />
          <path d="M18 4v7h7" fill="#cbd5e1" />
          <path d="M11 16h10M11 21h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </BrandSvg>
      );
    default:
      return (
        <BrandSvg size={size}>
          <circle cx="16" cy="16" r="15" fill="#e8eef8" stroke="#cbd5e1" />
          <ellipse cx="16" cy="10" rx="8" ry="4" fill="#2563eb" opacity="0.88" />
          <path d="M8 10v12c0 2.2 3.6 4 8 4s8-1.8 8-4V10" fill="none" stroke="#2563eb" strokeWidth="2" />
        </BrandSvg>
      );
  }
}

export function DatasourceLogo({ source, size = 30 }) {
  const key = logoKey(source);
  const iconUrl = brandIconUrl(key);
  const asset = brandIconAssets[key];
  const fallbackUrl = asset?.fallbackUrl;

  return (
    <span
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt={asset?.label || "Datasource"}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{
            width: "22px",
            height: "22px",
            objectFit: "contain",
          }}
          onError={(event) => {
            if (fallbackUrl && event.currentTarget.dataset.fallbackLoaded !== "true") {
              event.currentTarget.dataset.fallbackLoaded = "true";
              event.currentTarget.src = fallbackUrl;
              return;
            }
            event.currentTarget.style.display = "none";
            const fallback = event.currentTarget.nextElementSibling;
            if (fallback) fallback.style.display = "inline-flex";
          }}
        />
      ) : null}
      <span style={{ display: iconUrl ? "none" : "inline-flex" }}>
        {renderLogo(key, size)}
      </span>
    </span>
  );
}

export function DatasourceOptionRow({
  source,
  title,
  subtitle,
  meta,
  selected = false,
  actionLabel = "Select",
  onClick,
}) {
  return (
    <Tooltip fullWidth content={`${actionLabel} ${title}`}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "4px 7px",
          minHeight: "30px",
          borderRadius: "7px",
          border: `1px solid ${selected ? "var(--color-primary-200)" : "transparent"}`,
          background: selected ? "var(--color-primary-50)" : "transparent",
          color: "var(--color-text-base)",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <DatasourceLogo source={source} size={20} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "11px",
              fontWeight: "var(--font-weight-semibold)",
              lineHeight: 1.15,
            }}
          >
            {title}
          </span>
          {subtitle ? (
            <span
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--color-text-muted)",
                fontSize: "10px",
                lineHeight: 1.15,
                marginTop: "1px",
              }}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
        {meta ? (
          <span
            style={{
              flex: "0 0 auto",
              borderRadius: "999px",
              padding: "2px 6px",
              background: "var(--color-bg-muted)",
              color: "var(--color-text-muted)",
              fontSize: "10px",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            {meta}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          style={{
            flex: "0 0 auto",
            color: "var(--color-text-muted)",
            fontSize: "16px",
            lineHeight: 1,
          }}
        >
          +
        </span>
      </button>
    </Tooltip>
  );
}
