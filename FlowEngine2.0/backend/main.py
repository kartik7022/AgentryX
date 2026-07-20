from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.openapi.utils import get_openapi
from pathlib import Path

from backend.core.config import settings
from backend.core.database import init_db

# Existing FlowEngine routers
from backend.modules.intents.routes import router as intents_router
from backend.modules.validation_rules.routes import router as validation_rules_router
from backend.modules.datasources.routes import router as datasources_router
from backend.modules.tenant_purge.routes import router as tenant_purge_router
from backend.modules.email_inboxes.routes import router as email_inboxes_router
# Merged routers
from backend.modules.auth.routes import router as auth_router
from backend.modules.accounts.routes import router as accounts_router
from backend.modules.credential_gateway.routes import router as credential_gateway_router
from backend.modules.users.routes import router as users_router
from backend.modules.admins.routes import router as admins_router
from backend.modules.rbac.routes import router as rbac_router
from backend.modules.api_keys.routes import router as api_keys_router
# platforms_modules — router + portal_router now live here (not in admins)
from backend.modules.platforms_modules.routes import router as platforms_modules_router, portal_router

# sidebar_items — router + portal_router
from backend.modules.sidebar_items.routes import router as sidebar_items_router, portal_router as sidebar_items_portal_router
from backend.modules.datasource_types.routes import router as datasource_types_router
from backend.modules.module_groups.routes import router as module_groups_router
# Keycloak callback
from backend.modules.auth.keycloak_callback import router as keycloak_callback_router

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="FlowEngine - Unified Platform",
    debug=settings.DEBUG
)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="FlowEngine - Unified Platform",
        routes=app.routes,
    )
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer"
        }
    }
    schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi

@app.on_event("startup")
def on_startup():
    init_db()
    from backend.modules.admins.seeder import seed_super_admin
    seed_super_admin()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(keycloak_callback_router,    tags=["Keycloak Auth"])
app.include_router(intents_router,              tags=["Intents"])
app.include_router(validation_rules_router,     tags=["Validation Rules"])
app.include_router(datasources_router,          tags=["Datasources"])
app.include_router(tenant_purge_router)
app.include_router(auth_router,                 tags=["Auth"])
app.include_router(accounts_router,             tags=["Accounts"])
app.include_router(admins_router,               tags=["Admins"])
app.include_router(users_router,                tags=["Users"])
app.include_router(rbac_router,                 tags=["RBAC"])
app.include_router(platforms_modules_router,    tags=["Admin - Modules Management"])
app.include_router(portal_router,               tags=["Portal"])
app.include_router(sidebar_items_router,        tags=["Admin - Sidebar Items"])
app.include_router(sidebar_items_portal_router, tags=["Portal - Sidebar Items"])
app.include_router(api_keys_router)
app.include_router(email_inboxes_router, prefix="/api", tags=["Email Inboxes"])
app.include_router(datasource_types_router,     tags=["Datasource Types"])
app.include_router(module_groups_router,        tags=["Admin - Module Groups"])
app.include_router(credential_gateway_router,   tags=["Credential Gateway"])

# Static files
STATIC_DIR = Path(__file__).parent.parent / "frontend"
if STATIC_DIR.exists():
    app.mount("/frontend", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def root():
    return RedirectResponse(url=settings.admin_hub_url)


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
