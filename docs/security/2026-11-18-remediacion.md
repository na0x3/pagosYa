# Remediación de hallazgos ISO 27001 y cumplimiento UIF — 18 de noviembre de 2026

Seguimiento de la autoevaluación del 7 de noviembre (`2026-11-07-evaluacion-iso27001.md`). Rama `prod/2026-11-07`, que
ahora incluye todo el trabajo diario (`oct24-clean`): una sola línea de código.

| Hallazgo | Estado | Qué se hizo | Cómo se probó |
|---|---|---|---|
| **A-01** Operaciones con un solo factor | **Resuelto** (VPN: configurable) | El token `ops_` solo ya no da acceso. Token + código de una app de verificación (TOTP, RFC 6238) abren una sesión de 10 h; solo se guarda el SHA-256 de la sesión. Cada código sirve una vez. En producción el doble factor es obligatorio y no se puede apagar. `OPS_ALLOWED_IPS` limita operaciones a la IP de la VPN. Pérdida del teléfono: un administrador restablece el código y se cierran todas las sesiones. | Pruebas unitarias (vectores del RFC 6238), pruebas de la consola de operaciones en navegador, y prueba en vivo de la API: token solo → 401; token + código → sesión. |
| **A-02** Datos sensibles en texto plano | **Resuelto** (KMS: pendiente de infraestructura) | Número de cuenta bancaria (cuentas, desembolsos, KYC), NIT, CI, secreto de webhooks y secretos de doble factor se guardan cifrados con AES-256-GCM, campo por campo, en todas las escrituras. `FIELD_ENCRYPTION_KEY` es obligatoria en producción; rotación con `FIELD_ENCRYPTION_PREVIOUS_KEYS` y `scripts/encrypt-fields.ts`. | Pruebas unitarias (manipulación, rotación, escrituras anidadas) y en una base real: el dato guardado empieza con `pfe1.` y la aplicación lee el número original; rotación de llave probada. |
| **M-04** Registro de auditoría no inviolable | **Resuelto** | Cada entrada lleva el hash de la anterior (cadena SHA-256), calculado por la base de datos. Editar, borrar o vaciar el registro está prohibido por la base. `GET /internal/audit_log/verify` recalcula la cadena y da la "cabeza" para guardar fuera. | Prueba de integración en PostgreSQL real: 12 escrituras en paralelo forman una sola cadena; editar/borrar/vaciar es rechazado; una alteración como superusuario se detecta en la entrada exacta. |
| **M-09** Comercios sin doble factor | **Resuelto** | Doble factor opcional para comercios (Dinero → Verificación en dos pasos). Con él activo, entrar (contraseña o Google) pide el código, y restablecer la contraseña ya no inicia sesión solo. Cambiar la cuenta de desembolso aprobada pide el código; en producción, el doble factor es obligatorio para ese cambio. Las llaves de API solo se emiten con una llave secreta, nunca desde el panel. | Pruebas unitarias, en navegador y en vivo: sin código → `mfa_required`; con código → sesión. |
| **M-10** Respaldos sin prueba de restauración | **Procedimiento listo** (falta producción) | `scripts/backup-restore-check.mjs`: respaldo, cifrado, restauración en una base temporal, comparación exacta de filas por tabla y verificación de la cadena de auditoría. Política: `2026-11-18-backups.md`. | Simulacro local aprobado (`backup-restore-checks/2026-11-18-drill.md`, 167 tablas); con una entrada de auditoría alterada el simulacro falla, como debe. |

## Cumplimiento UIF / ASFI construido en la misma jornada

- **Listas de sanciones (debida diligencia).** La lista consolidada del Consejo de Seguridad de la ONU y la lista SDN de
  OFAC (EE. UU.) se cargan y se actualizan cada día a las 05:00. Cada solicitud de verificación revisa la razón social y
  el representante legal (sin importar tildes, orden o una letra de diferencia). Una posible coincidencia impide aprobar
  hasta que operaciones la descarta (explicando por qué) o la confirma; una coincidencia confirmada nunca se aprueba.
  Cuando una lista cambia, se vuelve a revisar a los comercios aprobados. Prueba con las listas reales: 1.007 registros
  ONU y 17.653 OFAC; ningún nombre boliviano común de prueba dio coincidencia falsa.
- **Persona expuesta políticamente (PEP).** El formulario pregunta si la persona lo es (o familiar/colaborador cercano) y
  qué cargo. Aprobar a una PEP exige una nota de revisión reforzada.
- **Nivel 1 sin NIT.** El nivel 1 pide la certificación del SIN de no inscripción en el NIT (PDF o foto), que operaciones
  verifica en el sitio del SIN.

## Pendiente (no es código)

- Pentest externo certificado (requisito ASFI): 4 a 6 semanas.
- Gestor de llaves (KMS) y VPN de operaciones: dependen de dónde se despliegue.
- Ejecutar el simulacro de restauración contra la base de producción y guardar el informe.
- Hallazgos M-05 (alertas), M-06 (secreto estático del banco del QR), M-07 (incrustación del pago) y M-08 siguen como
  estaban el 7 de noviembre.
