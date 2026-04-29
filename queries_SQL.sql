CREATE TABLE invitados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_invitado TEXT UNIQUE,
    rut TEXT,
    email TEXT,
    telefono TEXT,
    dieta TEXT,
    lleva_pareja TEXT,
    nombre_pareja TEXT,
    fecha TEXT
);

CREATE TABLE cancelados_matri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    rut TEXT,
    telefono TEXT,
    mensaje TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);