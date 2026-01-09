import { useState, useEffect, useCallback } from "react";
import type { Account, CreateAccountRequest, LoginRequest } from "../types/auth";
import { getCurrentUser, getStoredAccount, hasAccounts, logout as apiLogout, login as apiLogin, createAccount as apiCreateAccount } from "../lib/api";

export type AuthState = 
  | { status: "loading" }
  | { status: "unauthenticated"; hasExistingAccounts: boolean }
  | { status: "authenticated"; account: Account };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    setState({ status: "loading" });
    
    // Try to get current user from stored token
    const storedAccount = getStoredAccount();
    if (storedAccount) {
      try {
        const account = await getCurrentUser();
        if (account) {
          setState({ status: "authenticated", account });
          return;
        }
      } catch {
        // Token invalid, continue to check if accounts exist
      }
    }

    // Check if any accounts exist
    try {
      const exists = await hasAccounts();
      setState({ status: "unauthenticated", hasExistingAccounts: exists });
    } catch (e) {
      console.error("Failed to check accounts:", e);
      setState({ status: "unauthenticated", hasExistingAccounts: false });
    }
  }, []);

  const login = useCallback(async (request: LoginRequest) => {
    console.log("Attempting login for:", request.username);
    try {
      const response = await apiLogin(request);
      console.log("Login successful:", response.account.username);
      setState({ status: "authenticated", account: response.account });
    } catch (e) {
      console.error("Login failed:", e);
      throw e;
    }
  }, []);

  const register = useCallback(async (request: CreateAccountRequest) => {
    const account = await apiCreateAccount(request);
    // After registration, login
    await login({ username: request.username, password: request.password });
    return account;
  }, [login]);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ status: "unauthenticated", hasExistingAccounts: true });
  }, []);

  return { state, login, register, logout, checkAuth };
}
