var NlpExplorerService = Class.create();
NlpExplorerService.prototype = {
  initialize: function() {
    this.restMessageName = 'AgentaryxNlp';
    this.runMethodName = 'run_nlp';
    this.paginateMethodName = 'paginate';
  },

  runNlp: function(prompt, dataSource, page, pageSize) {
    if (!prompt) {
      return { error: 'Prompt is required.' };
    }

    var payload = {
      prompt: prompt,
      dataSource: dataSource || 'ServiceNow',
      page: page || 1,
      pageSize: pageSize || 10
    };

    return this._execute(this.runMethodName, payload);
  },

  paginate: function(requestId, page, pageSize) {
    if (!requestId) {
      return { error: 'Request ID is required for pagination.' };
    }

    var payload = {
      requestId: requestId,
      page: page || 1,
      pageSize: pageSize || 10
    };

    return this._execute(this.paginateMethodName, payload);
  },

  _execute: function(methodName, payload) {
    try {
      var request = new sn_ws.RESTMessageV2(
        this.restMessageName,
        methodName
      );

      request.setRequestHeader('Accept', 'application/json');
      request.setRequestHeader('Content-Type', 'application/json');

      // Uncomment and update this only if your middleware requires it.
      // request.setRequestHeader('X-Tenant-Context', this._getTenantJwt());

      request.setRequestBody(JSON.stringify(payload));

      var response = request.execute();
      var statusCode = response.getStatusCode();
      var responseBody = response.getBody();

      if (statusCode < 200 || statusCode >= 300) {
        gs.error(
          '[NlpExplorerService] HTTP ' +
          statusCode +
          ': ' +
          responseBody
        );

        return {
          error: 'NLP service returned HTTP status ' + statusCode
        };
      }

      if (!responseBody) {
        return { error: 'NLP service returned an empty response.' };
      }

      return JSON.parse(responseBody);

    } catch (ex) {
      gs.error('[NlpExplorerService] ' + ex.message);
      return {
        error: ex.message || ex.toString()
      };
    }
  },

  _getTenantJwt: function() {
    var request = new sn_ws.RESTMessageV2(
      this.restMessageName,
      'tenant_jwt'
    );

    request.setRequestHeader('Accept', 'application/json');

    var response = request.execute();
    var statusCode = response.getStatusCode();

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(
        'Unable to obtain tenant JWT. HTTP status: ' + statusCode
      );
    }

    var body = JSON.parse(response.getBody() || '{}');

    return body.token || body.jwt || body.access_token || '';
  },

  type: 'NlpExplorerService'
};
