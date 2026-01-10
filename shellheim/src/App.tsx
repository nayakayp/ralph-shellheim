import { useAuth } from "./hooks/useAuth";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import "./App.css";

function App() {
  const { state, login, register, logout } = useAuth();

  if (state.status === "loading") {
    return (
      <div className="loading-container">
        <div className="spinner spinner--lg" />
        <span>Initializing...</span>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <AuthPage
        hasExistingAccounts={state.hasExistingAccounts}
        onLogin={login}
        onRegister={register}
      />
    );
  }

  return <Dashboard account={state.account} onLogout={logout} />;
}

export default App;
