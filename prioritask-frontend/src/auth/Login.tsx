import { useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import styles from "./Login.module.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post("/auth/login", {
        email,
        password,
      });
      const { access_token } = response.data;
      localStorage.setItem("token", access_token);
      navigate("/dashboard");
    } catch (err: any) {
      if (err.response && err.response.status === 401) {
        setError("Credenciales inválidas. Por favor, verifica tu correo y contraseña.");
      } else {
        setError("Error al iniciar sesión. Revisa tus credenciales.");
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <img src="/logo.png" alt="Prioritask logo" className={styles.logo} />
        <h1 className={styles.title}>Iniciar sesión</h1>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Correo electrónico"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Contraseña"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className={styles.button}>Entrar</button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.registerText}>
          ¿No tienes cuenta? <a href="/register" className={styles.registerLink}>Regístrate</a>
        </p>
      </div>
    </div>
  );
}
