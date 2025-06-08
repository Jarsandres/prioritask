# 🔧 Prioritask – API inteligente de gestión de tareas

Prioritask es una API REST desarrollada con FastAPI que permite gestionar tareas domésticas de forma inteligente. Integra modelos de procesamiento de lenguaje natural (IA) para:
- Clasificar tareas por prioridad
- Agrupar tareas por similitud semántica
- Reformular títulos de tareas para mejorar su claridad

> Proyecto realizado como Trabajo de Fin de Grado en Desarrollo de Aplicaciones Multiplataforma 

---

## 🚀 Tecnologías utilizadas

- **FastAPI** · Backend asíncrono y documentación interactiva
- **SQLModel + SQLite** · ORM y persistencia ligera
- **JWT** · Autenticación segura
- **Hugging Face (Transformers)** · Procesamiento de lenguaje natural
- **Pytest + HTTPX** · Tests automáticos
- **Postman** · Pruebas manuales y exploración de la API


---

## 🧠 Funcionalidades

| Endpoint                           | Descripción                                  |
|------------------------------------|----------------------------------------------|
| `POST /api/v1/tasks/ai/prioritize` | Clasifica tareas según su urgencia/prioridad |
| `POST /api/v1/tasks/ai/group`      | Agrupa tareas por similitud semántica        |
| `POST /api/v1/tasks/ai/rewrite`    | Reformula títulos poco claros usando IA      |
| `POST /api/v1/auth/login`          | Autenticación mediante JWT                   |
| `CRUD /api/v1/tasks`               | Gestión clásica de tareas                    |

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
cp .env.example .env
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
DATABASE_URL=sqlite:///./tareas.db
JWT_SECRET_KEY=tu_clave_secreta

```

---

## 🖥️ Frontend

La carpeta `prioritask-frontend` contiene la interfaz React que consume esta API.

```bash
cd prioritask-frontend
npm install
cp .env.example .env
npm run dev
```
La aplicación estará disponible en [http://localhost:5173](http://localhost:5173).

Para generar los archivos estáticos ejecuta `npm run build` y para
previsualizarlos usa `npm run preview`.

---

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---