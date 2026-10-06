let usuarioActual = null;
let incidencias = [];

// Cargar incidencias desde la base de datos PostgreSQL a través del servidor
async function cargarIncidenciasDesdeBD() {
    try {
        const response = await fetch('/api/incidencias');
        incidencias = await response.json();
        document.getElementById("badgeCount").innerText = incidencias.length;
        renderizarGestion();
    } catch (error) {
        console.error("Error conectando con la base de datos:", error);
        alert("No se pudo conectar con el servidor backend. Asegúrate de que 'node server.js' esté encendido.");
    }
}

function iniciarSesion(e) {
    e.preventDefault();
    const usuario = document.getElementById("loginUsuario").value.trim().toLowerCase();
    const pass = document.getElementById("loginPassword").value;

    let rolAsignado = "";
    let nombreReal = "";

    if(usuario === 'estudiante' && pass === '1234') {
        rolAsignado = "Estudiante";
        nombreReal = "Carlos Estudiante";
    } else if(usuario === 'tecnico' && pass === '1234') {
        rolAsignado = "Técnico";
        nombreReal = "Carlos Técnico";
    } else if(usuario === 'supervisor' && pass === '1234') {
        rolAsignado = "Supervisor";
        nombreReal = "Ana Supervisora";
    } else {
        alert("Usuario o contraseña incorrectos.\nPrueba:\n• estudiante / 1234\n• tecnico / 1234\n• supervisor / 1234");
        return;
    }

    usuarioActual = { nombre: nombreReal, rol: rolAsignado };
    document.getElementById("lblUsuarioActivo").innerText = nombreReal;
    document.getElementById("lblRolActivo").innerText = rolAsignado;
    document.getElementById("login-screen").classList.add("hidden");
    
    // Cargar datos reales desde PostgreSQL al iniciar sesión
    cargarIncidenciasDesdeBD();
}

function cerrarSesion() {
    usuarioActual = null;
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("loginPassword").value = "";
}

function cambiarTab(tab) {
    ['registro', 'gestion', 'dashboard'].forEach(t => {
        document.getElementById(`vista-${t}`).classList.add('hidden');
        document.getElementById(`tab-${t}`).classList.remove('active');
    });
    document.getElementById(`vista-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if(tab === 'gestion') renderizarGestion();
    if(tab === 'dashboard') renderizarDashboard();
}

function calcularPrioridad(g, r, f) {
    let score = (g * 0.4) + (r * 0.4) + (f * 0.2);
    let prioridad = score > 7 ? "Alta" : (score >= 4 ? "Media" : "Baja");
    
    // SLA automático asignado por la aplicación según la prioridad
    let sla = prioridad === "Alta" ? 4 : (prioridad === "Media" ? 24 : 72);
    
    return { score: parseFloat(score.toFixed(1)), prioridad, sla };
}

function registrarIncidencia(e) {
    e.preventDefault();
    const sede = document.getElementById("sede").value;
    const bloque = document.getElementById("bloque").value;
    const salon = document.getElementById("salon").value;
    const descripcion = document.getElementById("descripcion").value;
    const gravedad = parseInt(document.getElementById("gravedad").value);
    const riesgo = parseInt(document.getElementById("riesgo").value);
    const fileInput = document.getElementById("imagenEvidencia");

    let similares = incidencias.filter(i => i.salon.toLowerCase() === salon.toLowerCase() && i.estado !== 'Verificado').length + 1;
    const res = calcularPrioridad(gravedad, riesgo, similares);

    if(fileInput.files && fileInput.files[0]) {
        let reader = new FileReader();
        reader.onload = async function(evt) {
            await enviarIncidenciaAlServidor({
                descripcion, sede, bloque, salon,
                reportadoPor: `${usuarioActual.nombre} (${usuarioActual.rol})`,
                gravedad, riesgo, frecuencia: similares,
                score: res.score, prioridad: res.prioridad,
                slaHoras: res.sla, imagen: evt.target.result
            });
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        enviarIncidenciaAlServidor({
            descripcion, sede, bloque, salon,
            reportadoPor: `${usuarioActual.nombre} (${usuarioActual.rol})`,
            gravedad, riesgo, frecuencia: similares,
            score: res.score, prioridad: res.prioridad,
            slaHoras: res.sla, imagen: null
        });
    }
}

async function enviarIncidenciaAlServidor(data) {
    try {
        const response = await fetch('http://localhost:3000/api/incidencias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if(response.ok) {
            alert("¡Reporte creado y guardado en la base de datos de PostgreSQL con éxito!");
            document.getElementById("formIncidencia").reset();
            await cargarIncidenciasDesdeBD();
            cambiarTab('gestion');
        } else {
            alert("Error al registrar la incidencia en el servidor.");
        }
    } catch (error) {
        console.error("Error de red:", error);
        alert("No se pudo conectar con el servidor.");
    }
}

function renderizarGestion() {
    const cont = document.getElementById("contenedorIncidencias");
    cont.innerHTML = "";
    let ordenadas = [...incidencias].sort((a,b) => b.score - a.score);

    ordenadas.forEach(inc => {
        let badgeClass = inc.prioridad === 'Alta' ? 'badge-alta' : (inc.prioridad === 'Media' ? 'badge-media' : 'badge-baja');
        let slaHorasVal = inc.sla_horas !== undefined ? inc.sla_horas : inc.slaHoras;
        
        let selectHtml = "";
        if(usuarioActual.rol === 'Estudiante') {
            selectHtml = `<span style="font-size:0.8rem; color:#64748b; font-style:italic;">Los estudiantes no cambian estados.</span>`;
        } else if(usuarioActual.rol === 'Técnico') {
            selectHtml = `
                <div class="flex gap-2 items-center">
                    <select id="est-${inc.id}" style="padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.85rem;">
                        <option value="Pendiente" ${inc.estado==='Pendiente'?'selected':''}>Pendiente</option>
                        <option value="En proceso" ${inc.estado==='En proceso'?'selected':''}>En proceso</option>
                        <option value="Resuelto" ${inc.estado==='Resuelto'?'selected':''}>Resuelto</option>
                    </select>
                    <button onclick="actualizarEstado(${inc.id})" class="btn" style="padding:4px 10px; font-size:0.8rem;">Actualizar</button>
                </div>
            `;
        } else if(usuarioActual.rol === 'Supervisor') {
            selectHtml = `
                <div class="flex gap-2 items-center">
                    <select id="est-${inc.id}" style="padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.85rem;">
                        <option value="Pendiente" ${inc.estado==='Pendiente'?'selected':''}>Pendiente</option>
                        <option value="En proceso" ${inc.estado==='En proceso'?'selected':''}>En proceso</option>
                        <option value="Resuelto" ${inc.estado==='Resuelto'?'selected':''}>Resuelto</option>
                        <option value="Verificado" ${inc.estado==='Verificado'?'selected':''}>Verificado (Cierre)</option>
                    </select>
                    <button onclick="actualizarEstado(${inc.id})" class="btn" style="padding:4px 10px; font-size:0.8rem;">Actualizar</button>
                </div>
            `;
        }

        let reportadoPorVal = inc.reportado_por !== undefined ? inc.reportado_por : inc.reportadoPor;

        let cardDiv = document.createElement("div");
        cardDiv.className = `incident-card ${inc.vencida ? 'vencida' : ''}`;
        cardDiv.innerHTML = `
            <div class="flex justify-between items-center" style="margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f1f5f9;">
                <div class="flex items-center gap-2">
                    <span class="badge ${badgeClass}">Prioridad ${inc.prioridad} (${inc.score})</span>
                    <strong style="font-size: 0.95rem;">#${inc.id} - ${inc.salon} (${inc.bloque})</strong>
                    ${inc.vencida ? '<span class="badge badge-vencida">⚠️ VENCIDA (SLA ' + slaHorasVal + 'h)</span>' : ''}
                </div>
                <span style="font-size: 0.8rem; font-weight:600; background:#f1f5f9; padding:2px 8px; border-radius:4px;">Estado: ${inc.estado}</span>
            </div>
            <div class="flex gap-4 items-start" style="font-size: 0.875rem; color:#475569; margin-bottom: 0.75rem;">
                <div style="flex: 1;">
                    <p><strong>Descripción:</strong> ${inc.descripcion}</p>
                    <p><strong>Ubicación:</strong> ${inc.sede} > ${inc.bloque} > ${inc.salon}</p>
                    <p><strong>SLA Automático:</strong> ${slaHorasVal} Horas | <strong>Reportado por:</strong> ${reportadoPorVal}</p>
                </div>
                ${inc.imagen ? `<div><img src="${inc.imagen}" class="preview-img" alt="Evidencia"></div>` : ''}
            </div>
            <div class="flex justify-between items-center" style="font-size:0.8rem; border-top:1px solid #f1f5f9; padding-top:0.75rem; flex-wrap:wrap; gap:1rem;">
                <div>
                    <span style="color:#64748b; font-weight:600;">Historial:</span>
                    <span>${(inc.historial || []).map(h => `${h.estado} (${h.usuario})`).join(' ➔ ')}</span>
                </div>
                <div>${selectHtml}</div>
            </div>
        `;
        cont.appendChild(cardDiv);
    });
}

async function actualizarEstado(id) {
    const nuevo = document.getElementById(`est-${id}`).value;
    if(nuevo === 'Verificado' && usuarioActual.rol !== 'Supervisor') {
        alert("Solo el Supervisor puede marcar una incidencia como Verificada.");
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/incidencias/${id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevo, usuario: usuarioActual.nombre })
        });

        if(response.ok) {
            alert(`Incidencia #${id} actualizada correctamente a: ${nuevo} en la base de datos.`);
            await cargarIncidenciasDesdeBD();
        } else {
            alert("Error al actualizar el estado en el servidor.");
        }
    } catch (error) {
        console.error("Error de red:", error);
        alert("No se pudo conectar con el servidor.");
    }
}

function renderizarDashboard() {
    document.getElementById("statVencidas").innerText = incidencias.filter(i => i.vencida).length;
    document.getElementById("statPendientes").innerText = incidencias.filter(i => i.estado === 'Pendiente').length;
    document.getElementById("statResueltas").innerText = incidencias.filter(i => i.estado === 'Resuelto' || i.estado === 'Verificado').length;

    let tHtml = `<table><thead><tr><th>ID</th><th>Sede / Espacio</th><th>Descripción</th><th>Prioridad</th><th>Estado</th></tr></thead><tbody>`;
    incidencias.forEach(i => {
        tHtml += `<tr><td>#${i.id}</td><td><strong>${i.sede} (${i.salon})</strong></td><td>${i.descripcion}</td><td>${i.prioridad}</td><td><span style="font-weight:600; color:var(--primary);">${i.estado}</span></td></tr>`;
    });
    tHtml += `</tbody></table>`;
    document.getElementById("tablaEspacios").innerHTML = tHtml;
}

function descargarPDF() {
    const elemento = document.getElementById('areaImpresionPDF');
    const opciones = {
        margin: 0.5,
        filename: 'Reporte_Mantenimiento_UNIMINUTO.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().from(elemento).set(opciones).save();
}