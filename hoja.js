const { google } = require('googleapis');

if (!process.env.GOOGLE_CREDENTIALS_JSON) {
  console.error('ERROR: no se encontró la variable de entorno GOOGLE_CREDENTIALS_JSON');
  process.exit(1);
}

let credentialsObj
try {
  // 2) Parsear la variable (cadena JSON) a objeto JS
  credentialsObj = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  
} catch (err) {
  console.error('ERROR: GOOGLE_CREDENTIALS_JSON no es JSON válido:', err);
  process.exit(1);
}

// 3) Crear el GoogleAuth usando ese objeto de credenciales
const auth = new google.auth.GoogleAuth({
  credentials: credentialsObj,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'] // ajusta según necesites
});

// -----------------------------------------------------------------------------------
// Función auxiliar: convierte un índice 0-based en letra de columna (A, B, …, Z, AA, AB, …)
function columnaLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

// -----------------------------------------------------------------------------------
// registrarPago(fecha, email, plan, monto, app, spreadsheetId):
//   1) Asegura que exista la tabla “Users” en A1:E1 (encabezados sin ID User).
//   2) Añade una fila nueva en A:E con Fecha, Email, Plan, Monto, App.
//   3) Reconstruye el bloque de Estadísticas (G1:… → fórmulas COUNTIFS + SUM).
//   4) Aplica formato “tabla lila” con letras negras y encabezados en negrita.
// -----------------------------------------------------------------------------------
async function registrarPago(email, plan, monto, spreadsheetId, app) {
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const sheetId = 0; // Ajusta si tu sheetId NO es 0

  // 1) --- Encabezados de “Users” (A1:E1) sin ID User ---
  const headersRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A1:E1'
  });
  if (!headersRes.data.values || headersRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1:E1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[ 'Fecha', 'Email', 'Plan', 'Monto', 'App' ]]
      }
    });
  }

  // 2) --- Añadir fila en Users (A:E) ---
  const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
  const nuevaFila = [[ fecha, email, plan, monto, app ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'A2:E2',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: nuevaFila }
  });

  // 3) --- Reconstruir Estadísticas en G1:… usando fórmulas ---
  await rebuildStatisticsWithFormulas(sheets, spreadsheetId, sheetId);

  // 4) --- Formatear Usuarios y Estadísticas ---
  await formatUsersTable(sheets, spreadsheetId, sheetId);
  await formatStatsTable(sheets, spreadsheetId, sheetId);

  console.log(`✅ Pago registrado: ${email} | Plan=${plan} | Monto=${monto} | App=${app}`);
}


// -----------------------------------------------------------------------------------
// rebuildStatisticsWithFormulas:
//   - Extrae la lista única de planes (col C) y apps (col E).
//   - Genera un bloque G1:… con fórmulas COUNTIFS y SUM (no valores estáticos).
//   - Borra G1:Z1000 antes de escribir el bloque nuevo.
// -----------------------------------------------------------------------------------
async function rebuildStatisticsWithFormulas(sheets, spreadsheetId, sheetId) {
  // 1) Leer todos los planes (C2:C) y apps (E2:E) de “Users”
  const plansRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'C2:C'
  });
  const appsRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'E2:E'
  });

  const planesRaw = plansRes.data.values?.flatMap(r => r[0] ? [r[0]] : []) || [];
  const appsRaw = appsRes.data.values?.flatMap(r => r[0] ? [r[0]] : []) || [];

  // 2) Listas únicas (ordenadas alfabéticamente)
  const planesUnicos = Array.from(new Set(planesRaw)).sort((a,b) => a.localeCompare(b));
  const appsUnicos = Array.from(new Set(appsRaw)).sort((a,b) => a.localeCompare(b));

  const numPlanes = planesUnicos.length;
  const numApps = appsUnicos.length;
  const totalFilas = 1 + numApps + 1;      // 1 encabezado + apps + 1 fila Total
  const totalColumnas = 1 + numPlanes + 1; // 1 “App/Plan” + n planes + 1 “Total”

  // 3) Construir la matriz de fórmulas (matrizStats) tamaño [totalFilas x totalColumnas]
  const matrizStats = Array(totalFilas)
    .fill(0)
    .map(_ => Array(totalColumnas).fill(''));

  // 3.a) Encabezado fila 0: ['App / Plan', Plan1, Plan2, …, 'Total']
  matrizStats[0][0] = 'App / Plan';
  for (let j = 0; j < numPlanes; j++) {
    matrizStats[0][1 + j] = planesUnicos[j];
  }
  matrizStats[0][totalColumnas - 1] = 'Total';

  // 3.b) Filas de cada App (índices 1..numApps)
  for (let i = 0; i < numApps; i++) {
    const filaIdx = 1 + i; // dentro de matrizStats
    const nombreApp = appsUnicos[i];
    matrizStats[filaIdx][0] = nombreApp;

    for (let j = 0; j < numPlanes; j++) {
      const nombrePlan = planesUnicos[j];
      // COUNTIFS:
      //   rango App = E:E, criterio App = "nombreApp"
      //   rango Plan = C:C, criterio Plan = "nombrePlan"
      const formulaCountifs =
        `=COUNTIFS(\n` +
        `  E:E, "${nombreApp}",\n` +
        `  C:C, "${nombrePlan}"\n` +
        `)`;
      matrizStats[filaIdx][1 + j] = formulaCountifs;
    }

    // 3.b.1) Celda “Total” para esa App = SUM de las celdas de COUNTIFS en esa fila
    //   - La primera columna de plan en la hoja es G→H: H = índice 7 (Cero-based)
    //   - La última columna de plan en la hoja es 7 + numPlanes - 1
    const letraIniPlan = columnaLetter(6 + 1);           // 7 → "H"
    const letraFinPlan = columnaLetter(6 + numPlanes);   // 6+numPlanes → letra correcta
    const filaHoja = 1 + 1 + i; // statsValues[0] = G1, statsValues[1] = G2 → 1-based
    matrizStats[filaIdx][totalColumnas - 1] =
      `=SUM(${letraIniPlan}${filaHoja}:${letraFinPlan}${filaHoja})`;
  }

  // 3.c) Fila “Total” (índice 1 + numApps)
  const idxFilaTotal = 1 + numApps;
  matrizStats[idxFilaTotal][0] = 'Total';

  // 3.c.1) En cada columna de plan j: =SUM(<columna COUNTIFS>2:<columna COUNTIFS><última fila de apps>)
  for (let j = 0; j < numPlanes; j++) {
    const letraColPlan = columnaLetter(6 + 1 + j); // 6 + (1+j)
    const filaIniApps = 2;
    const filaFinApps = 1 + numApps;
    matrizStats[idxFilaTotal][1 + j] =
      `=SUM(${letraColPlan}${filaIniApps}:${letraColPlan}${filaFinApps})`;
  }

  // 3.c.2) En la celda de “Total de montos” (última columna de matrizStats):
  //         =SUM(D2:D)
  matrizStats[idxFilaTotal][totalColumnas - 1] = '=SUM(D2:D)';

  // 4) Borrar contenido previo en G1:Z1000
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'G1:Z1000'
  });

  // 5) Escribir matrizStats en G1:[últimaColumna][últimaFila]
  const letraFinalCol = columnaLetter(6 + totalColumnas - 1);
  const ultimaFilaHoja = totalFilas; // porque arranca en fila 1
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `G1:${letraFinalCol}${ultimaFilaHoja}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: matrizStats }
  });
}


// -----------------------------------------------------------------------------------
// formatUsersTable:
//   - Detecta cuántas filas ocupa “Users” en A:A (incluido encabezado).
//   - Aplica fondo lila, texto negro y negrita en encabezado A1:E1.
//   - Rellena de lila clarito las filas de datos A2:E<numFilas>, texto negro.
//   - Añade bordes sólidos en toda la zona A1:E<numFilas>.
// -----------------------------------------------------------------------------------
async function formatUsersTable(sheets, spreadsheetId, sheetId) {
  // 1) Leer cuántas filas hay en A:A
  const colARes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A1:A1000'
  });
  const numFilas = colARes.data.values ? colARes.data.values.length : 0;
  if (numFilas === 0) return;

  const startRow = 0;      // índice 0 = fila 1
  const endRow = numFilas; // exclusivo
  const startCol = 0;      // índice 0 = col A
  const endCol = 5;        // exclusivo: A=0,…,E=4 → 5

  // Colores RGB entre 0 y 1
  const headerBg = { red: 0.6, green: 0.4, blue: 0.8 }; // lila oscuro
  const bodyBg   = { red: 0.95, green: 0.95, blue: 1.0 }; // lila clarito

  const requests = [];

  // 1.a) Encabezado A1:E1 → fondo lila oscuro, texto negro negrita, centrado
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: startRow + 1,
        startColumnIndex: startCol,
        endColumnIndex: endCol
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: headerBg,
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          horizontalAlignment: 'CENTER'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
    }
  });

  // 1.b) Filas de datos A2:E<numFilas> → fondo lila clarito, texto negro alineado a la izquierda
  if (numFilas > 1) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: startRow + 1,
          endRowIndex: endRow,
          startColumnIndex: startCol,
          endColumnIndex: endCol
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: bodyBg,
            textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } },
            horizontalAlignment: 'LEFT'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    });
  }

  // 1.c) Bordes en toda la zona A1:E<numFilas>
  requests.push({
    updateBorders: {
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: endRow,
        startColumnIndex: startCol,
        endColumnIndex: endCol
      },
      top:         { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
      bottom:      { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
      left:        { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
      right:       { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
      innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
      innerVertical:   { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } }
    }
  });

  // Ejecutar batchUpdate
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });
  }
}


// -----------------------------------------------------------------------------------
// formatStatsTable:
//   - Detecta cuántas filas y columnas ocupa el bloque Estadísticas (G1:…).
//   - Aplica fondo lila, texto negro y negrita en encabezados (fila 1 del bloque) y en fila “Total”.
//   - Rellena de lila clarito las filas intermedias (Apps).
//   - Añade bordes sólidos en toda la zona G1:[últimaCol][últimaFila].
// -----------------------------------------------------------------------------------
async function formatStatsTable(sheets, spreadsheetId, sheetId) {
  // 1) Leer un rango amplio G1:Z1000 para identificar dónde hay datos
  const statsRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'G1:Z1000'
  });
  const statsValues = statsRes.data.values || [];
  if (statsValues.length === 0) return;

  // 2) Detectar última fila usada en statsValues (número de filas con datos)
  const lastRowInValues = statsValues.length;
  // 3) Detectar cuántas columnas usa la cabecera (statsValues[0].length)
  const headerRow = statsValues[0];
  const lastColInHeader = headerRow.length;

  // 4) Convertir a índices 0-based para batchUpdate
  const startRowIndex = 0;                       // G1 → fila 1 → índice 0
  const endRowIndex = lastRowInValues;           // exclusivo
  const startColIndex = 6;                       // columna G → índice 6
  const endColIndex = 6 + lastColInHeader;       // exclusivo

  const headerBg = { red: 0.6, green: 0.4, blue: 0.8 }; // lila oscuro
  const bodyBg   = { red: 0.95, green: 0.95, blue: 1.0 }; // lila clarito

  const requests = [];

  // 4.a) Encabezado (fila índice 0 en statsValues)
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: startRowIndex,
        endRowIndex: startRowIndex + 1,
        startColumnIndex: startColIndex,
        endColumnIndex: endColIndex
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: headerBg,
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          horizontalAlignment: 'CENTER'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
    }
  });

  // 4.b) Buscar fila “Total” en statsValues (columna G)
  const totalRowIndexInValues = statsValues.findIndex(row => row[0] === 'Total');

  // 4.c) Filas de Apps (entre índice 1 y totalRowIndexInValues-1)
  if (totalRowIndexInValues > 1) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: startRowIndex + 1,
          endRowIndex: totalRowIndexInValues,
          startColumnIndex: startColIndex,
          endColumnIndex: endColIndex
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: bodyBg,
            textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } },
            horizontalAlignment: 'LEFT'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    });
  }

  // 4.d) Fila “Total” (índice totalRowIndexInValues)
  if (totalRowIndexInValues >= 0) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: totalRowIndexInValues,
          endRowIndex: totalRowIndexInValues + 1,
          startColumnIndex: startColIndex,
          endColumnIndex: endColIndex
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: headerBg,
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    });
  }

  // 4.e) Bordes en toda la zona G1:[últimaCol][últimaFila]
  requests.push({
    updateBorders: {
      range: {
        sheetId,
        startRowIndex: startRowIndex,
        endRowIndex: endRowIndex,
        startColumnIndex: startColIndex,
        endColumnIndex: endColIndex
      },
      top:             { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
      bottom:          { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
      left:            { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
      right:           { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
      innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
      innerVertical:   { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } }
    }
  });

  // Ejecutar batchUpdate
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });
  }
}


// -----------------------------------------------------------------------------------
// Exportar la función principal registrarPago para uso externo.
// Ejemplo de uso:
//
//   const { registrarPago } = require('./stats');
//   (async () => {
//     try {
//       await registrarPago(
//         'cliente@correo.com',
//         'Plan Basico',
//         35,
//         'TU_SPREADSHEET_ID',
//         'BCP'
//       );
//       console.log('¡Pago agregado y estadísticas actualizadas!');
//     } catch (err) {
//       console.error('Error:', err);
//     }
//   })();
// -----------------------------------------------------------------------------------
module.exports = {
  registrarPago
};
