/* ============================================================
   CEIP Capitulaciones · Publicador de resultados en la web
   ------------------------------------------------------------
   Añadido a la app de Evaluaciones. NO modifica nada de la app:
   solo lee state.datos y escribe un resumen agregado en Firebase.

   INSTALACIÓN: una línea antes de </body> en el index.html
     <script src="publicar-web.js"></script>

   QUÉ PUBLICA
   -----------
   Únicamente porcentajes agregados de todo el centro. Nunca:
     · datos de alumnado, ni siquiera iniciales
     · resultados por curso o por grupo
     · resultados del Aula TEA (grupo pequeño, sería identificable)
     · Religión, sus alternativas ni Atención Educativa

   FLUJO
   -----
   Botón → calcula → muestra vista previa → tú confirmas → publica.
   Nada sale a la web sin que lo hayas visto antes.
   ============================================================ */
(function () {
  'use strict';

  var RUTA = 'publico/resultados';

  /* Áreas que salen en las gráficas, con su nombre para las familias.
     Lo demás se cuenta en el total pero no se desglosa. */
  var AREAS = {
    LCL:  'Lengua',
    MAT:  'Matemáticas',
    ING:  'Inglés',
    CMN:  'Conocimiento del Medio',
    EAR:  'Ed. Artística',
    EFI:  'Ed. Física',
    FR2:  'Francés',
    // Educación Infantil
    CA:   'Crecimiento en Armonía',
    DEE:  'Descubrimiento del Entorno',
    CRR:  'Comunicación y Representación'
  };

  /* Nunca se desglosan ni se publican por separado */
  var EXCLUIDAS = ['REL', 'REV', 'ATEDU', 'ALCT', 'VCE'];

  var POSITIVAS = {
    primaria: ['SB', 'NT', 'BI', 'SU'],
    infantil: ['EXC', 'BUE', 'ADE']
  };
  var NEGATIVAS = { primaria: ['IN'], infantil: ['NAD'] };

  /* ---------- Acceso al estado de la app ----------
     OJO: la app declara `let state`, y las variables declaradas con
     let/const NO quedan colgadas de window. Hay que leerlas por su
     nombre, que sí es accesible entre scripts del mismo documento. */
  function getState() {
    try { if (typeof state !== 'undefined' && state) return state; } catch (e) {}
    if (window.state) return window.state;
    return null;
  }

  /* Busca el trimestre tolerando que la clave sea número o texto */
  function ramaTrimestre(datosAnyo, trim) {
    if (!datosAnyo) return null;
    if (datosAnyo[trim]) return datosAnyo[trim];
    if (datosAnyo[String(trim)]) return datosAnyo[String(trim)];
    if (datosAnyo[Number(trim)]) return datosAnyo[Number(trim)];
    return null;
  }

  /* ---------- Cálculo ---------- */
  function calcular() {
    var st = getState();
    if (!st) { calcular.motivo = 'No se ha podido leer el estado de la app.'; return null; }
    if (!st.datos) { calcular.motivo = 'La app no tiene datos cargados.'; return null; }

    var anyo = st.anyo, trim = st.trimestre;
    var datosAnyo = st.datos[anyo];
    if (!datosAnyo) {
      calcular.motivo = 'No hay datos del curso ' + anyo + '. Cursos disponibles: ' +
        (Object.keys(st.datos).join(', ') || 'ninguno') + '.';
      return null;
    }
    var cursos = ramaTrimestre(datosAnyo, trim);
    if (!cursos) {
      calcular.motivo = 'No hay datos del trimestre ' + trim + '. Trimestres con datos: ' +
        (Object.keys(datosAnyo).join(', ') || 'ninguno') + '.';
      return null;
    }

    var total = 0, positivas = 0;
    var dist = { SB: 0, NT: 0, BI: 0, SU: 0, IN: 0, EXC: 0, BUE: 0, ADE: 0, NAD: 0 };
    var porArea = {};                 // cod -> {pos, tot, tipo}
    var etapa = { primaria: { pos: 0, tot: 0 }, infantil: { pos: 0, tot: 0 } };
    var alumnos = { total: 0, todoPositivo: 0 };
    var gruposUsados = 0;

    Object.keys(cursos).forEach(function (cid) {
      var c = cursos[cid];
      if (!c || !c.alumnos) return;
      var tipo = c.tipo;
      if (tipo !== 'primaria' && tipo !== 'infantil') return;   // fuera TEA
      gruposUsados++;

      var pos = POSITIVAS[tipo], neg = NEGATIVAS[tipo];

      c.alumnos.forEach(function (al) {
        var notas = al.notas || {};
        var tieneAlguna = false, todasPos = true;

        (c.materias || Object.keys(notas)).forEach(function (m) {
          var g = notas[m];
          if (!g || g === 'BL' || g === '*' || g === '') return;
          if (EXCLUIDAS.indexOf(m) > -1) return;

          tieneAlguna = true;
          total++;
          if (dist[g] !== undefined) dist[g]++;

          var esPos = pos.indexOf(g) > -1;
          if (esPos) positivas++; else if (neg.indexOf(g) > -1) todasPos = false;

          etapa[tipo].tot++;
          if (esPos) etapa[tipo].pos++;

          if (AREAS[m]) {
            if (!porArea[m]) porArea[m] = { pos: 0, tot: 0, tipo: tipo };
            porArea[m].tot++;
            if (esPos) porArea[m].pos++;
          }
        });

        if (tieneAlguna) {
          alumnos.total++;
          if (todasPos) alumnos.todoPositivo++;
        }
      });
    });

    if (!total) {
      calcular.motivo = 'Se han encontrado ' + gruposUsados + ' grupos, pero ninguna calificación ' +
        'contabilizable. Recuerda que se excluyen el Aula TEA, Religión y Atención Educativa.';
      return null;
    }

    var pct = function (a, b) { return b ? Math.round(a * 1000 / b) / 10 : 0; };

    var areas = Object.keys(porArea)
      .filter(function (m) { return porArea[m].tot >= 15; })   // evita porcentajes sobre muy pocos datos
      .map(function (m) {
        return { cod: m, nombre: AREAS[m], tipo: porArea[m].tipo, pct: pct(porArea[m].pos, porArea[m].tot) };
      })
      .sort(function (a, b) { return b.pct - a.pct; });

    return {
      actualizado: new Date().toISOString(),
      curso: anyo,
      trimestre: trim,
      global: pct(positivas, total),
      totalCalificaciones: total,
      alumnadoTodoPositivo: pct(alumnos.todoPositivo, alumnos.total),
      distribucion: dist,
      etapas: {
        infantil: etapa.infantil.tot ? pct(etapa.infantil.pos, etapa.infantil.tot) : null,
        primaria: etapa.primaria.tot ? pct(etapa.primaria.pos, etapa.primaria.tot) : null
      },
      areas: areas,
      destacadas: areas.slice(0, 3).map(function (a) { return a.nombre; }),
      enTrabajo: areas.length > 2 ? [areas[areas.length - 1].nombre] : [],
      gruposIncluidos: gruposUsados
    };
  }

  /* ---------- Interfaz ---------- */
  function estilos() {
    if (document.getElementById('pubweb-css')) return;
    var s = document.createElement('style');
    s.id = 'pubweb-css';
    s.textContent =
      '.pubweb-fab{position:fixed;right:20px;bottom:20px;z-index:9000;border:0;cursor:pointer;' +
      'background:linear-gradient(135deg,#0066dd,#004aad);color:#fff;font:600 14px/1 system-ui,sans-serif;' +
      'padding:14px 20px;border-radius:40px;box-shadow:0 6px 22px rgba(0,74,173,.4);display:flex;align-items:center;gap:8px}' +
      '.pubweb-fab:hover{transform:translateY(-2px)}' +
      '.pubweb-ov{position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.pubweb-box{background:#fff;border-radius:20px;max-width:660px;width:100%;max-height:88vh;overflow:auto;padding:26px;font-family:system-ui,sans-serif}' +
      '.pubweb-box h2{margin:0 0 6px;font-size:1.3rem;color:#004aad}' +
      '.pubweb-box .sub{margin:0 0 18px;color:#667;font-size:.9rem}' +
      '.pubweb-kpis{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:16px}' +
      '.pubweb-kpi{background:#f1f6ff;border-radius:14px;padding:14px;text-align:center}' +
      '.pubweb-kpi b{display:block;font-size:1.7rem;color:#004aad;line-height:1}' +
      '.pubweb-kpi span{font-size:.78rem;color:#667}' +
      '.pubweb-list{margin:0 0 16px;padding:0;list-style:none;font-size:.9rem}' +
      '.pubweb-list li{display:flex;justify-content:space-between;padding:7px 10px;border-radius:8px}' +
      '.pubweb-list li:nth-child(odd){background:#f8fafc}' +
      '.pubweb-nota{background:#fff8e1;border-left:4px solid #ffc107;border-radius:10px;padding:12px 14px;font-size:.85rem;color:#5c4400;margin-bottom:16px}' +
      '.pubweb-btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}' +
      '.pubweb-btn{border:0;cursor:pointer;padding:11px 20px;border-radius:30px;font:600 14px system-ui,sans-serif}' +
      '.pubweb-btn.ok{background:#2E7D32;color:#fff}.pubweb-btn.no{background:#eef2f7;color:#334}';
    document.head.appendChild(s);
  }

  function abrir() {
    var d = calcular();
    if (!d) {
      alert('No se puede publicar todavía.\n\n' + (calcular.motivo || 'No hay datos en el trimestre activo.'));
      return;
    }

    estilos();
    var ov = document.createElement('div');
    ov.className = 'pubweb-ov';
    ov.innerHTML =
      '<div class="pubweb-box">' +
        '<h2>Publicar resultados en la web</h2>' +
        '<p class="sub">Curso ' + d.curso + ' · Trimestre ' + d.trimestre +
        ' · ' + d.gruposIncluidos + ' grupos · ' + d.totalCalificaciones + ' calificaciones</p>' +

        '<div class="pubweb-kpis">' +
          '<div class="pubweb-kpi"><b>' + d.global + '%</b><span>Calificaciones positivas</span></div>' +
          '<div class="pubweb-kpi"><b>' + d.alumnadoTodoPositivo + '%</b><span>Alumnado sin negativas</span></div>' +
          (d.etapas.infantil !== null ? '<div class="pubweb-kpi"><b>' + d.etapas.infantil + '%</b><span>Infantil</span></div>' : '') +
          (d.etapas.primaria !== null ? '<div class="pubweb-kpi"><b>' + d.etapas.primaria + '%</b><span>Primaria</span></div>' : '') +
        '</div>' +

        '<ul class="pubweb-list">' +
          d.areas.map(function (a) {
            return '<li><span>' + a.nombre + '</span><b>' + a.pct + '%</b></li>';
          }).join('') +
        '</ul>' +

        '<div class="pubweb-nota"><strong>Se publica solo esto.</strong><br>' +
        'Porcentajes del centro completo. No sale ningún dato de alumnado, ni resultados por curso o grupo, ' +
        'ni del Aula TEA, ni de Religión o sus alternativas.</div>' +

        '<div class="pubweb-btns">' +
          '<button class="pubweb-btn no" data-x="no">Cancelar</button>' +
          '<button class="pubweb-btn ok" data-x="si">Publicar en la web</button>' +
        '</div>' +
      '</div>';

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.dataset.x === 'no') { ov.remove(); return; }
      if (e.target.dataset.x === 'si') { publicar(d, ov); }
    });
    document.body.appendChild(ov);
  }

  function publicar(d, ov) {
    var btn = ov.querySelector('[data-x="si"]');
    btn.textContent = 'Publicando…'; btn.disabled = true;

    var db = window._db || window._firebase;
    if (!db) { alert('Sin conexión con Firebase. Comprueba el indicador de la app.'); ov.remove(); return; }

    var clave = d.curso.replace('/', '-') + '_T' + d.trimestre;
    db.ref(RUTA + '/ultimo').set(d)
      .then(function () { return db.ref(RUTA + '/historico/' + clave).set(d); })
      .then(function () {
        ov.remove();
        alert('Publicado. Ya se ve en la página «Nuestro Centro» de la web del colegio.');
      })
      .catch(function (e) {
        btn.textContent = 'Publicar en la web'; btn.disabled = false;
        alert('No se ha podido publicar: ' + e.message);
      });
  }

  /* ---------- Botón flotante ---------- */
  function montar() {
    if (document.querySelector('.pubweb-fab')) return;
    estilos();
    var b = document.createElement('button');
    b.className = 'pubweb-fab';
    b.innerHTML = '🌐 Publicar en la web';
    b.title = 'Publica un resumen agregado de este trimestre en la web del colegio';
    b.onclick = abrir;
    document.body.appendChild(b);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();

  window.PublicarWeb = { calcular: calcular, abrir: abrir };
})();