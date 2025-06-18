// backup-usuarios-modular.js  (CommonJS)
const fs = require('fs');
const { collection, query, where, getDocs } = require("firebase/firestore/lite");
const { db1 } = require('./firebase');   // tu archivo con getFirestore()
const db = db1

async function backupUsuarios() {
  const usuariosRef = collection(db, "usuarios");
  const q           = query(usuariosRef, where('plan', '!=', ''));

  const snap  = await getDocs(q);
  const datos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  fs.writeFileSync('backup_usuarios.json', JSON.stringify(datos, null, 2));
  console.log(`✅ ${datos.length} documentos guardados`);
}

backupUsuarios().catch(console.error);