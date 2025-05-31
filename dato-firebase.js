const {collection, query, where, getDocs,updateDoc } = require("firebase/firestore/lite");

// Configuración de Firebase
const {db1} = require('./firebase')

const db = db1

// Variable global para almacenar los emails
let emailCache = [];

// Función para obtener emails desde Firestore
const fetchEmailsFromFirestore = async () => {
    try {
        const usuariosRef = collection(db, "usuarios");
        const q = query(usuariosRef, where("plan", "!=", "Sin Plan"));
        const querySnapshot = await getDocs(q);

        const emails = [];
        querySnapshot.forEach(doc => {
            emails.push(doc.data().email);
        });

        emailCache = emails; // Actualiza la variable global
        console.log("Emails actualizados en la caché.");
        return emailCache;
    } catch (error) {
        console.error("Error al obtener los datos de Firestore: ", error);
        return [];
    }
};

// Función para buscar un email en la caché
const findEmailInCache = (email) => {
    return emailCache.includes(email);
};

function calcularFechaFinalUnMesDespues() {
    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = hoy.getMonth(); // enero = 0
    const anio = hoy.getFullYear();
  
    // Crear una fecha tentativa con el mismo día del siguiente mes
    let fechaFinal = new Date(anio, mes + 1, dia);
  
    // Si se desbordó (ej: 31 feb → 2 mar), ajustamos al último día del siguiente mes
    if (fechaFinal.getMonth() !== ((mes + 1) % 12)) {
      fechaFinal = new Date(anio, mes + 2, 0); // día 0 del mes siguiente = último día del mes anterior
    }
  
    return fechaFinal;
  }
  

const darPlan = async (email, nuevoPlan) => {
    const { Timestamp } = require("firebase/firestore/lite");
    try {
        const usuariosRef = collection(db, "usuarios");
        const q = query(usuariosRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return {
                success: false,
                message: "❌ No existe el correo o tal vez fue eliminado."
            };
        }

        let actualizado = false;

        for (const doc of querySnapshot.docs) {
            const nuevosDatos = {
                plan: nuevoPlan,
                QR: true,
                crear_contacto: true,
                fecha_final: Timestamp.fromDate(calcularFechaFinalUnMesDespues())

            };

            if (nuevoPlan === 'Medium') {
                nuevosDatos.gmail = true;
            }

            await updateDoc(doc.ref, nuevosDatos);
            actualizado = true;
        }


        if (actualizado) {
            return {
                success: true,
                message: "✅ Plan y QR actualizados correctamente."
            };
        } else {
            return {
                success: false,
                message: "❌ No se pudo actualizar el documento."
            };
        }

    } catch (error) {
        console.error("Error al modificar Firestore:", error);
        return {
            success: false,
            message: "❌ Error al modificar."
        };
    }
};

// Exportar funciones
module.exports = {
    fetchEmailsFromFirestore,
    findEmailInCache,
    darPlan,
    getCachedEmails: () => emailCache,
};