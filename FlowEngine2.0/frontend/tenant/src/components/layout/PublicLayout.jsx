import { Outlet } from "react-router-dom";

export function PublicLayout() {
  return (
    <div className="app-page">
      <Outlet />
    </div>
  );
}
