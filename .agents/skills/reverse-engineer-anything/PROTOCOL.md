# Protocolo Operativo de Evidencia e Ingeniería Inversa

## 1. Taxonomía Epistémica Obligatoria (4 Niveles)
Toda afirmación técnica, hallazgo de auditoría o mapeo de código DEBE iniciar con una de estas 4 etiquetas:

- `[CONFIRMED: archivo:línea o tool:offset]` -> Hecho verificado directamente en código, binario, base de datos o captura. Cero suposiciones.
- `[INFERRED: patrón_o_convención]` -> Deducción lógica por firmas de tipos, nomenclatura o estructura estándar, sin contrato explícito.
- `[HYPOTHESIS: cómo_validar_o_refutar]` -> Conjetura sobre comportamiento en tiempo de ejecución o negocio. Incluye siempre cómo probarla.
- `[CONTRADICTION: fuente_A vs fuente_B]` -> Discrepancia detectada entre documentación/esquemas y la implementación real.

## 2. Los 5 Principios Operativos Innegociables

1. **Herramienta Determinista Primero, LLM Después:**
   Prohibido analizar binarios crudos, bundles minificados de Vite o volcados SQLite WAL a ojo. Ejecuta primero las herramientas de REA, GitNexus, `sqlite3`, `tshark` o desofuscadores mecánicos; usa el modelo solo para análisis semántico.
2. **Inmutabilidad Estricta del Objetivo (Solo Lectura):**
   Durante una fase de investigación o ingeniería inversa, jamás edites los archivos analizados. Vuelca todos los informes, diagramas Mermaid, especificaciones OpenAPI y registros de renombrado en `./notes/`.
3. **Sanitización Previa de Tráfico y Capturas:**
   Antes de procesar archivos `.har`, `.pcap` o logs de red, purga mediante script cualquier cabecera `Authorization`, `Cookie`, tokens JWT o claves secretas.
4. **Circuit Breaker Anti-Deriva (Límite de Alcance):**
   Analiza un máximo de 5 flujos de extremo a extremo o 20 funciones por iteración (máximo 3 niveles de profundidad de llamada). Si en un módulo las etiquetas `[HYPOTHESIS]` superan el 20 % del total, DETÉN el análisis, guarda las dudas en `notes/open-questions.md` y solicita validación humana.
5. **Análisis Diferencial Múltiple:**
   Para deducir formatos binarios, estados de sincronización HLC/OCC o tramas de red sin documentar, compara un mínimo de 3 muestras variando un único parámetro a la vez.
