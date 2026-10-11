# 🔧 Prioritask – API inteligente de gestión de tareas

Prioritask es una API REST desarrollada con FastAPI que permite gestionar tareas domésticas de forma inteligente y segura. Integra modelos de procesamiento de lenguaje natural (IA) para:
- Clasificar tareas por prioridad
- Agrupar tareas por similitud semántica
- Reformular títulos de tareas para mejorar su claridad
- Sugerir tareas pendientes con inferencia local (Ollama) protegida por autenticación

> Proyecto realizado como Trabajo de Fin de Grado en Desarrollo de Aplicaciones Multiplataforma 

---

## 🚀 Tecnologías utilizadas

- **FastAPI** · Backend asíncrono y documentación interactiva
- **SQLModel + SQLite / PostgreSQL** · ORM y persistencia con borrado lógico (Soft Delete)
- **JWT & RBAC** · Autenticación segura y control de acceso basado en roles
- **Ollama (`qwen2.5:7b`)** · Inferencia de IA local con fallback determinista resiliente
- **Seguridad Rigurosa** · Mitigación CORS estricta (CWE-942), protección de endpoints de IA y validación Zero Trust
- **Pytest + HTTPX** · Tests automáticos y suite SDET con cobertura superior al 65%
- **Postman** · Pruebas manuales y exploración de la API

---

## 🧠 Funcionalidades

| Endpoint                           | Descripción                                                       |
|------------------------------------|-------------------------------------------------------------------|
| `POST /api/v1/tasks/ai/prioritize` | Clasifica tareas según su urgencia/prioridad                      |
| `POST /api/v1/tasks/ai/group`      | Agrupa tareas por similitud semántica                             |
| `POST /api/v1/tasks/ai/rewrite`    | Reformula títulos poco claros usando IA                           |
| `POST /api/v1/tasks/ai/suggest`    | Sugiere tareas contextuales con IA (**Protegido con JWT**)        |
| `POST /api/v1/auth/login`          | Autenticación mediante JWT con soporte para refresh tokens       |
| `CRUD /api/v1/tasks`               | Gestión integral de tareas con soft delete e historial de eventos |

---

## ⚙️ Instalación

### 1. Clona el repositorio

```bash
git clone https://github.com/tuusuario/prioritask.git
cd prioritask
```

### 2. Crea entorno virtual e instala dependencias

```bash
python -m venv .venv
source .venv/bin/activate  # o .venv\Scripts\activate en Windows
pip install -e .[dev]
```

### 3. Configura el entorno

Crea un archivo `.env` a partir del ejemplo:

```bash
cp .env.example .env  # en Windows usa "copy .env.example .env"
```

### 4. Lanza el servidor

```bash
uvicorn app.main:app --reload
```

### 5. Aplica las migraciones

Si es la primera vez que arrancas el proyecto o has modificado los modelos,
ejecuta las migraciones de Alembic para crear el esquema de la base de datos:

```bash
alembic upgrade head
```

---

## ✅ Ejecutar los tests

```bash
pytest --cov=... 
```

Incluye cobertura para endpoints inteligentes, autenticación y persistencia.

---

## 🧪 Documentación interactiva

Una vez lanzado, puedes acceder a:

- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Redoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 🔒 Variables de entorno (.env.example)

```env
DATABASE_URL=sqlite+aiosqlite:///./prioritask.db

# Seguridad (Generar clave segura con: python -c "import secrets; print(secrets.token_hex(32))")
JWT_SECRET_KEY=CHANGE_ME_SUPER_SECRET_KEY
CORS_ORIGINS=["http://localhost:5173"]
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_TIMEOUT=1.0
```

Antes de iniciar el servidor, genera una clave criptográfica de 256 bits (64 caracteres hexadecimales) para `JWT_SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

> 🔐 **Postura de Seguridad en Arranque (`validate_security_posture`):** El validador de `Settings` en `app/core/config.py` bloquea automáticamente en arranque el uso de claves débiles o por defecto (`dev-secret`, `CHANGE_ME_SUPER_SECRET_KEY`, `tu_clave_secreta`, `secret`, `changeme`). Además, cuando `ENVIRONMENT=production`, exige obligatoriamente que `JWT_SECRET_KEY` tenga una longitud mínima de **32 caracteres** y que `DATABASE_URL` utilice un motor **PostgreSQL** (rechazando bases de datos locales SQLite).

`CORS_ORIGINS` debe ser un array en formato JSON (o una lista separada por comas) que se convertirá en una lista en Python. Por ejemplo:

```env
CORS_ORIGINS=["http://localhost:5173","https://miapp.com"]
```

> 🛡️ **Seguridad CORS (CWE-942):** Por motivos de seguridad y estándar W3C, no se permite el uso del comodín `*` cuando las credenciales están habilitadas (`allow_credentials=True`). Los orígenes son automáticamente validados y normalizados (eliminando espacios y barras finales).

---

## 🖥️ Frontend

La carpeta `prioritask-frontend` contiene la interfaz SPA desarrollada con React, TypeScript y Vite.
Incorpora un **sistema de diseño Retro 90's mobile-first**, barra de navegación dock ergonómica (`MobileBottomNav`), **soporte completo de modo Claro/Oscuro** persistente y arquitectura basada en componentes comunes (`TaskCard`, `RetroWindow`).

```bash
cd prioritask-frontend
npm install
cp .env.example .env  # en Windows usa "copy .env.example .env"
npm run dev
```
La aplicación estará disponible en [http://localhost:5173](http://localhost:5173).

Para generar los archivos estáticos ejecuta `npm run build` y para
previsualizarlos usa `npm run preview`.

---

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.