import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthProvider";

const TenantWorkspaceContext = createContext(null);

function moduleKey(value) {
  return String(value || "").replace(/[\s-]+/g, "_").toLowerCase();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return value.split(",").map((entry) => entry.trim()).filter(Boolean);
    }
  }

  return [];
}

function normalizeSidebarItems(items) {
  return (items || []).map((item) => ({
    id: item.id || item.value,
    value: item.value,
    label: item.label,
    href: item.href,
    icon: item.icon,
    navSection: item.nav_section || "primary",
    openMode: item.open_mode || "internal",
    hiddenFromModuleUser: Boolean(item.hidden_from_module_user),
    type: item.type || "page",
  }));
}

function normalizeModules(modules) {
  const normalized = (modules || []).map((module) => {
    const sidebarItems = normalizeStringArray(module.sidebar_items || module.sidebarItems);

    return {
      ...module,
      id: module.id || module.module_id || module.name,
      name: module.name || module.module_name || "Module",
      groupId: module.group_id || module.groupId || null,
      groupName: module.group_name || module.groupName || null,
      externalUrl: module.external_url || module.externalUrl || "",
      sidebarItems,
      sidebar_items: sidebarItems,
    };
  });

  return [
    ...normalized.filter((module) => !module.externalUrl),
    ...normalized.filter((module) => module.externalUrl),
  ];
}

export function TenantWorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({
    loading: true,
    sidebarItems: [],
    modules: [],
  });
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [preferredModuleKey, setPreferredModuleKey] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const refreshWorkspace = useCallback((preferredModuleName) => {
    if (preferredModuleName) {
      setPreferredModuleKey(moduleKey(preferredModuleName));
    }
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const [sidebarResponse, modulesResponse] = await Promise.all([
          api.get("/portal/sidebar-items").catch(() => ({ items: [] })),
          api.get("/portal/my-modules").catch(() => []),
        ]);

        if (cancelled) return;

        const portalModules = normalizeModules(modulesResponse || []);

        setState({
          loading: false,
          sidebarItems: normalizeSidebarItems(sidebarResponse?.items || []),
          modules: portalModules,
        });
      } catch {
        if (!cancelled) {
          setState({
            loading: false,
            sidebarItems: [],
            modules: [],
          });
        }
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (preferredModuleKey && state.modules.length > 0) {
      const preferredIndex = state.modules.findIndex((module) => moduleKey(module.name) === preferredModuleKey);
      if (preferredIndex !== -1) {
        setActiveModuleIndex(preferredIndex);
        setPreferredModuleKey("");
        return;
      }
    }

    if (state.modules.length === 0 && activeModuleIndex !== 0) {
      setActiveModuleIndex(0);
      return;
    }

    if (state.modules.length > 0 && activeModuleIndex > state.modules.length - 1) {
      setActiveModuleIndex(0);
    }
  }, [activeModuleIndex, preferredModuleKey, state.modules]);

  const value = useMemo(() => {
    const activeModule = state.modules[activeModuleIndex] || state.modules[0] || null;
    const allowedSidebarValues = new Set(activeModule?.sidebarItems || []);
    const hideModuleUserItems = user?.role === "tenant_module_user";
    const visibleSidebarItems = activeModule
      ? state.sidebarItems.filter((item) => (
        allowedSidebarValues.has(item.value) &&
        !(hideModuleUserItems && item.hiddenFromModuleUser)
      ))
      : [];
    const primaryItems = visibleSidebarItems.filter((item) => item.navSection === "primary");
    const moreItems = visibleSidebarItems.filter((item) => item.navSection === "more");

    return {
      ...state,
      activeModule,
      activeModuleIndex,
      setActiveModuleIndex,
      refreshWorkspace,
      primaryItems,
      moreItems,
    };
  }, [activeModuleIndex, refreshWorkspace, state, user?.role]);

  return (
    <TenantWorkspaceContext.Provider value={value}>
      {children}
    </TenantWorkspaceContext.Provider>
  );
}

export function useTenantWorkspace() {
  const context = useContext(TenantWorkspaceContext);
  if (!context) {
    throw new Error("useTenantWorkspace must be used inside TenantWorkspaceProvider");
  }

  return context;
}
