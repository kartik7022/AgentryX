api.controller = function($scope) {
  var c = this;

  c.loading = false;
  c.error = '';

  c.runQuery = function() {
    c.error = '';

    if (!c.data.prompt || !c.data.prompt.trim()) {
      c.error = 'Please enter a prompt.';
      return;
    }

    c.loading = true;

    c.server.get({
      action: 'runNlp',
      prompt: c.data.prompt,
      dataSource: c.data.dataSource,
      page: 1,
      pageSize: c.data.pageSize
    }).then(function(response) {
      c.applyResponse(response.data);
    }).catch(function(error) {
      c.error = 'Unable to execute the query.';
      console.error(error);
    }).finally(function() {
      c.loading = false;
    });
  };

  c.nextPage = function() {
    if (c.data.currentPage >= c.data.totalPages) {
      return;
    }

    c.loadPage(c.data.currentPage + 1);
  };

  c.previousPage = function() {
    if (c.data.currentPage <= 1) {
      return;
    }

    c.loadPage(c.data.currentPage - 1);
  };

  c.loadPage = function(pageNumber) {
    c.error = '';
    c.loading = true;

    c.server.get({
      action: 'paginate',
      requestId: c.data.requestId,
      page: pageNumber,
      pageSize: c.data.pageSize
    }).then(function(response) {
      c.applyResponse(response.data);
    }).catch(function(error) {
      c.error = 'Unable to load the requested page.';
      console.error(error);
    }).finally(function() {
      c.loading = false;
    });
  };

  c.applyResponse = function(responseData) {
    c.data.hasRun = true;
    c.data.records = responseData.records || [];
    c.data.columns = responseData.columns || [];
    c.data.generatedQuery = responseData.generatedQuery || c.data.generatedQuery || '';
    c.data.requestId = responseData.requestId || c.data.requestId || '';
    c.data.currentPage = responseData.currentPage || 1;
    c.data.totalPages = responseData.totalPages || 1;
    c.data.totalRecords = responseData.totalRecords || 0;

    if (responseData.error) {
      c.error = responseData.error;
    }
  };
};
