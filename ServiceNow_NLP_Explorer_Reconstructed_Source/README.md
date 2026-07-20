# ServiceNow NLP Data Explorer – Reconstructed Source

This package contains a reconstructed version of the ServiceNow NLP Data Explorer implementation discussed previously.

## Important

The original Personal Developer Instance was reclaimed due to inactivity. Therefore, this package is a reconstruction based on the earlier design and workflow; it is not an exact export from the original instance.

## Included files

- `widget/html-template.html`
- `widget/client-controller.js`
- `widget/server-script.js`
- `widget/style.css`
- `script-include/NlpExplorerService.js`

## Functional flow

1. User enters a natural-language prompt in the Service Portal Widget.
2. Client Controller sends the prompt to the Widget Server Script.
3. Server Script calls `NlpExplorerService`.
4. Script Include uses `RESTMessageV2` to invoke the NLP middleware.
5. Middleware returns records, generated query, request ID, and pagination details.
6. Widget renders the records and allows previous/next-page navigation.

## ServiceNow configuration required

Create a REST Message named:

`AgentaryxNlp`

Create HTTP methods with these names:

- `run_nlp`
- `paginate`
- `tenant_jwt` (only if JWT is required)

Configure the endpoints to match the deployed middleware, for example:

- `/v1/analyze`
- `/v1/paginate`
- `/v1/tenant/jwt`

## Notes

- Replace REST Message and method names if your instance uses different names.
- Configure authentication using a Credential Alias, OAuth profile, or Basic Authentication as required.
- Do not hardcode production passwords, client secrets, or JWT values in scripts.
- Test the REST Message methods before running the widget.
