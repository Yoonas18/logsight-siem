import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import EmptyState from "./EmptyState.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { booting, isAuthenticated } = useAuth();
  const location = useLocation();

  if (booting) {
    return <EmptyState title="Checking access" description="Restoring your LogSight session." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
