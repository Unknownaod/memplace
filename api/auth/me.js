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
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const sessionId = getCookie(req, "mem_session");

    if (!sessionId) {
      return res.status(200).json({
        authenticated: false,
        user: null
      });
    }

    const db = await getDb();

    const session = await db.collection("sessions").findOne({
      _id: sessionId
    });

    if (!session) {
      return res.status(200).json({
        authenticated: false,
        user: null
      });
    }

    // Expired session
    if (session.expiresAt < new Date()) {
      await db.collection("sessions").deleteOne({
        _id: sessionId
      });

      return res.status(200).json({
        authenticated: false,
        user: null
      });
    }

    const user = await db.collection("users").findOne({
      _id: session.userId
    });

    if (!user) {
      return res.status(200).json({
        authenticated: false,
        user: null
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user._id,
        username: user.username,
        discordUsername: user.discordUsername,
        avatar: user.avatar,
        balance: user.balance,
        pixelsPlaced: user.pixelsPlaced,
        clanId: user.clanId
      }
    });

  } catch (error) {
    console.error("Auth me error:", error);

    return res.status(500).json({
      error: "Failed to check authentication"
    });
  }
}
