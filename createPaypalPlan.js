import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

async function crearPlanMensual() {
  try {
    // 1️⃣ Obtener token de acceso de PayPal
    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
    ).toString("base64");

    const tokenRes = await axios.post(
      `${process.env.PAYPAL_API}/v1/oauth2/token`,
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const accessToken = tokenRes.data.access_token;
    console.log("✅ Token obtenido");

    // 2️⃣ Crear un producto (solo una vez)
    const productRes = await axios.post(
      `${process.env.PAYPAL_API}/v1/catalogs/products`,
      {
        name: "Suscripción Mensual SoulArt",
        description: "Acceso a cómics premium y exclusivos cada mes",
        type: "SERVICE",
        category: "SOFTWARE",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const productId = productRes.data.id;
    console.log("✅ Producto creado:", productId);

    // 3️⃣ Crear el plan mensual
    const planRes = await axios.post(
      `${process.env.PAYPAL_API}/v1/billing/plans`,
      {
        product_id: productId,
        name: "Plan mensual SoulArt",
        description: "Acceso mensual a contenido premium de SoulArt",
        status: "ACTIVE",
        billing_cycles: [
          {
            frequency: {
              interval_unit: "MONTH",
              interval_count: 1,
            },
            tenure_type: "REGULAR",
            sequence: 1,
            total_cycles: 0, // 0 = infinito
            pricing_scheme: {
              fixed_price: {
                value: "4.00", // 💲 Precio mensual
                currency_code: "USD",
              },
            },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee_failure_action: "CONTINUE",
          payment_failure_threshold: 3,
        },
        taxes: {
          percentage: "0",
          inclusive: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Plan mensual creado:");
    console.log(planRes.data);
    console.log("👉 Guarda este ID en tu .env como PAYPAL_PLAN_ID:");
    console.log(planRes.data.id);
  } catch (err) {
    console.error("❌ Error creando plan:", err.response?.data || err.message);
  }
}

crearPlanMensual();
