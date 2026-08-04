import { useState } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import styles from "./Login.module.css";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // FE-005 (bonus): Estado de carga para prevenir doble submit
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await api.post("/auth/register", {
        nombre: username,
        email,
        password,
      });
      navigate("/login");
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al registrar. Revisa los datos.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <img src="/logo.png" alt="Prioritask logo" className={styles.logo} />
        <h1 className={styles.title}>Crear cuenta</h1>
        <form onSubmit={handleRegister}>
          <input
            type="text"
            placeholder="Nombre de usuario"
            className={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            required
          />
          <input
            type="email"
            placeholder="Correo electrónico"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          {/* FE-005: Botón deshabilitado durante el registro */}
          <button
            type="submit"
            className={styles.button}
            disabled={isLoading}
          >
            {isLoading ? "Registrando..." : "Registrarse"}
          </button>
        </form>
        <p className={styles.registerText}>
          {/* FE-008: Sustituido <a href> por <Link to> para navegación SPA */}
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className={styles.registerLink}>
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
