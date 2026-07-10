export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (request.method === "GET") {
      const url = new URL(request.url);
      const nombre = url.searchParams.get("nombre");
      
      if (nombre) {
        // Al buscar por nombre específico (para la cancelación), traemos también los datos de la pareja
        const persona = await env.DB.prepare("SELECT email, telefono, rut, lleva_pareja, nombre_pareja FROM invitados WHERE nombre_invitado = ?").bind(nombre).first();
        return new Response(JSON.stringify(persona || {}), { headers: corsHeaders });
      } else {
        // Al cargar la página, enviamos los nombres y el permiso de pareja para armar el buscador estricto
        const { results } = await env.DB.prepare("SELECT nombre_invitado, permite_pareja FROM invitados").all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }
    }

    if (request.method === "POST") {
      try {
        const data = await request.json();
        const esRSVP = data.tipo === "rsvp" || Array.isArray(data);
        
        // --- 1. LÓGICA RSVP (ACTUALIZAR INVITADO EXISTENTE) ---
        if (esRSVP) {
          const invitados = Array.isArray(data) ? data : data.invitados;
          const asunto = data.asunto || "Asistencia confirmada";
          const cuerpoMensaje = data.cuerpo || "Tu asistencia ha sido confirmada.";

          for (const persona of invitados) {
            // Se usa UPDATE porque los nombres ya existen en la BD
            await env.DB.prepare(`
              UPDATE invitados 
              SET rut = ?2, email = ?3, telefono = ?4, dieta = ?5, 
                  lleva_pareja = ?6, nombre_pareja = ?7, dieta_pareja = ?8, fecha = ?9
              WHERE nombre_invitado = ?1
            `).bind(
              persona.nombre_invitado, persona.rut, persona.email, persona.telefono,
              persona.dieta, persona.lleva_pareja ? "Sí" : "No", 
              persona.nombre_pareja || "-", persona.dieta_pareja || "-",
              new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })
            ).run();

            if (persona.email && env.RESEND_API_KEY) {
              const primerNombre = persona.nombre_invitado.trim().split(/\s+/)[0];
              await enviarEmail(env, persona.email, asunto, `Hola ${primerNombre},\n\n${cuerpoMensaje}`);
            }
          }
        } 
        
        // --- 2. LÓGICA CANCELACIÓN ---
        else if (data.tipo === "cancelacion") {
          let eliminados = [];
          
          for (let persona of data.invitados) {
            const row = await env.DB.prepare("SELECT rut, email, telefono, lleva_pareja, nombre_pareja FROM invitados WHERE nombre_invitado = ?").bind(persona.nombre).first();
            
            if (row) {
              await env.DB.prepare("INSERT INTO cancelados_matri (nombre, rut, telefono, mensaje) VALUES (?, ?, ?, ?)")
                .bind(persona.nombre, row.rut, data.telefono, data.mensaje || "Sin mensaje").run();

              // Si iba con pareja, registramos a la pareja en cancelados también para tener el registro
              if (row.lleva_pareja === "Sí" && row.nombre_pareja !== "-") {
                  await env.DB.prepare("INSERT INTO cancelados_matri (nombre, rut, telefono, mensaje) VALUES (?, ?, ?, ?)")
                    .bind(row.nombre_pareja, row.rut, data.telefono, "Cancelado automáticamente junto al invitado principal").run();
              }

              await env.DB.prepare("DELETE FROM invitados WHERE nombre_invitado = ?").bind(persona.nombre).run();
              eliminados.push(persona.nombre);
            }
          }

          if (eliminados.length === 0) throw new Error("No se encontraron esos invitados en la base de datos.");

          if (data.email && env.RESEND_API_KEY) {
            const primerNombre = eliminados[0].trim().split(/\s+/)[0];
            await enviarEmail(env, data.email, data.asunto, `Hola ${primerNombre},\n\n${data.cuerpo}`);
          }

          if (env.RESEND_API_KEY) {
            const nombresEliminadosTxt = eliminados.join(", ");
            const msjNovios = `Se ha registrado una nueva cancelación.\n\nNombres cancelados: ${nombresEliminadosTxt}\nTeléfono: ${data.telefono}\nCorreo: ${data.email}\nMensaje del invitado: ${data.mensaje || "No dejó mensaje"}`;
            await enviarEmail(env, "regalos@antoyfelipe.com", `Cancelación de Asistencia: ${eliminados[0]}`, msjNovios);
          }
        }

        return new Response(JSON.stringify({ status: "success" }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }
    return new Response("Not Allowed", { status: 405 });
  }
};

async function enviarEmail(env, destinatario, asunto, cuerpo) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Matrimonio <regalos@antoyfelipe.com>', 
      to: destinatario,
      subject: asunto,
      text: cuerpo
    })
  });
}