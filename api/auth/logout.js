import { MongoClient } from "mongodb";

let client;

async function getDb() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }

  return client.db(
    process.env.MONGODB_DB || "middle_eastern_mixing"
  );
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.trim().split("=");

    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const sessionId = getCookie(req, "mem_session");

    if (sessionId) {
      const db = await getDb();

      await db.collection("sessions").deleteOne({
        _id: sessionId
      });
    }

    res.setHeader(
      "Set-Cookie",
      "mem_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );

    return res.status(200).json({
      success: true
    });

  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      error: "Failed to logout"
    });
  }
}
