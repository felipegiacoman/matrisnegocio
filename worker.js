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
        const persona = await env.DB.prepare("SELECT email, telefono, rut FROM invitados WHERE nombre_invitado = ?").bind(nombre).first();
        return new Response(JSON.stringify(persona || {}), { headers: corsHeaders });
      } else {
        const { results } = await env.DB.prepare("SELECT DISTINCT nombre_invitado FROM invitados").all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }
    }

    if (request.method === "POST") {
      try {
        const data = await request.json();
        const esRSVP = data.tipo === "rsvp" || Array.isArray(data);
        
        // --- 1. LÓGICA RSVP ---
        if (esRSVP) {
          const invitados = Array.isArray(data) ? data : data.invitados;
          const asunto = data.asunto || "Asistencia confirmada";
          const cuerpoMensaje = data.cuerpo || "Tu asistencia ha sido confirmada.";

          for (const persona of invitados) {
            await env.DB.prepare(`
              INSERT INTO invitados (nombre_invitado, rut, email, telefono, dieta, lleva_pareja, nombre_pareja, fecha)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
              ON CONFLICT(nombre_invitado) DO UPDATE SET
                rut = ?2, email = ?3, telefono = ?4, dieta = ?5, lleva_pareja = ?6, nombre_pareja = ?7, fecha = ?8
            `).bind(
              persona.nombre_invitado, persona.rut, persona.email, persona.telefono,
              persona.dieta, persona.lleva_pareja ? "Sí" : "No", persona.nombre_pareja || "-",
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
            const row = await env.DB.prepare("SELECT rut, email, telefono FROM invitados WHERE nombre_invitado = ?").bind(persona.nombre).first();
            
            if (row) {
              await env.DB.prepare("INSERT INTO cancelados_matri (nombre, rut, telefono, mensaje) VALUES (?, ?, ?, ?)")
                .bind(persona.nombre, row.rut, data.telefono, data.mensaje || "Sin mensaje").run();

              await env.DB.prepare("DELETE FROM invitados WHERE nombre_invitado = ?").bind(persona.nombre).run();
              eliminados.push(persona.nombre);
            }
          }

          if (eliminados.length === 0) throw new Error("No se encontraron esos invitados en la base de datos.");

          if (data.email && env.RESEND_API_KEY) {
            const primerNombre = eliminados[0].trim().split(/\s+/)[0];
            await enviarEmail(env, data.email, data.asunto, `Hola ${primerNombre},\n\n${data.cuerpo}`);
          }

          // Notificación a los novios
          if (env.RESEND_API_KEY) {
            const nombresEliminadosTxt = eliminados.join(", ");
            const msjNovios = `Se ha registrado una nueva cancelación.\n\nNombres cancelados: ${nombresEliminadosTxt}\nTeléfono: ${data.telefono}\nCorreo: ${data.email}\nMensaje del invitado: ${data.mensaje || "No dejó mensaje"}`;
            // CAMBIA EL CORREO AL QUE RECIBIRÁ LAS NOTIFICACIONES EL CLIENTE
            await enviarEmail(env, "rsvp@boda-cliente.com", `Cancelación de Asistencia: ${eliminados[0]}`, msjNovios);
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
      from: 'Matrimonio <rsvp@boda-cliente.com>', // <--- REEMPLAZAR POR EL CORREO ZOHO DEL CLIENTE
      to: destinatario,
      subject: asunto,
      text: cuerpo
    })
  });
}