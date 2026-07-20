(function() {
  data.dataSourceOptions = [
    { label: 'ServiceNow', value: 'ServiceNow' },
    { label: 'Salesforce', value: 'Salesforce' },
    { label: 'Snowflake', value: 'Snowflake' }
  ];

  data.dataSource = data.dataSource || 'ServiceNow';
  data.prompt = data.prompt || '';
  data.records = [];
  data.columns = [];
  data.generatedQuery = '';
  data.requestId = '';
  data.currentPage = 1;
  data.totalPages = 1;
  data.totalRecords = 0;
  data.pageSize = 10;
  data.hasRun = false;

  if (!input || !input.action) {
    return;
  }

  try {
    var service = new global.NlpExplorerService();
    var result;

    if (input.action === 'runNlp') {
      result = service.runNlp(
        input.prompt,
        input.dataSource,
        parseInt(input.page || 1, 10),
        parseInt(input.pageSize || 10, 10)
      );
    } else if (input.action === 'paginate') {
      result = service.paginate(
        input.requestId,
        parseInt(input.page || 1, 10),
        parseInt(input.pageSize || 10, 10)
      );
    } else {
      data.error = 'Unsupported action.';
      return;
    }

    if (!result) {
      data.error = 'No response received from NLP service.';
      return;
    }

    if (result.error) {
      data.error = result.error;
      return;
    }

    data.records = result.records || result.rows || [];
    data.columns = result.columns || getColumns(data.records);
    data.generatedQuery = result.generatedQuery || result.query || result.sql || '';
    data.requestId = result.requestId || result.request_id || '';
    data.currentPage = parseInt(result.currentPage || result.page || 1, 10);
    data.totalRecords = parseInt(result.totalRecords || result.total_records || data.records.length, 10);
    data.totalPages = parseInt(
      result.totalPages ||
      result.total_pages ||
      Math.max(1, Math.ceil(data.totalRecords / parseInt(input.pageSize || 10, 10))),
      10
    );
    data.hasRun = true;

  } catch (ex) {
    data.error = ex.message || ex.toString();
    gs.error('[NLP Explorer Widget] ' + data.error);
  }

  function getColumns(records) {
    if (!records || !records.length) {
      return [];
    }

    var columns = [];
    var firstRecord = records[0];

    for (var key in firstRecord) {
      if (firstRecord.hasOwnProperty(key)) {
        columns.push(key);
      }
    }

    return columns;
  }
})();
