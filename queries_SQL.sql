CREATE TABLE invitados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_invitado TEXT UNIQUE,
    permite_pareja INTEGER DEFAULT 0, -- 1 = Sí puede llevar pareja, 0 = No
    rut TEXT,
    email TEXT,
    telefono TEXT,
    dieta TEXT,
    lleva_pareja TEXT,                -- "Sí" o "No" (Lo llena el invitado si permite_pareja = 1)
    nombre_pareja TEXT,
    dieta_pareja TEXT,                -- Nueva columna para la dieta del acompañante
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