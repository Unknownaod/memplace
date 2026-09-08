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

  try {

    const db = await getDb();
    const collection = db.collection("website_activity");

    /*
      ==========================================
      GET ACTIVE USERS
      ==========================================
    */

    if (req.method === "GET") {

      const cutoff =
        new Date(Date.now() - 60 * 1000);

      const active =
        await collection.countDocuments({
          lastSeen: {
            $gte: cutoff
          }
        });

      return res.status(200).json({
        success: true,
        active
      });
    }

    /*
      ==========================================
      POST HEARTBEAT
      ==========================================
    */

    if (req.method === "POST") {

      let visitorId =
        getCookie(req, "mem_activity");

      /*
        If the visitor doesn't have an
        activity cookie, create one.
      */

      if (!visitorId) {

        visitorId =
          crypto.randomUUID();

        res.setHeader(
          "Set-Cookie",
          `mem_activity=${encodeURIComponent(visitorId)}; Path=/; Max-Age=31536000; SameSite=Lax`
        );
      }

      const sessionId =
        getCookie(req, "mem_session");

      await collection.updateOne(
        {
          _id: visitorId
        },
        {
          $set: {
            lastSeen: new Date(),
            authenticated: !!sessionId
          }
        },
        {
          upsert: true
        }
      );

      return res.status(200).json({
        success: true
      });
    }

    return res.status(405).json({
      error: "Method not allowed"
    });

  } catch (error) {

    console.error(
      "Website activity error:",
      error
    );

    return res.status(500).json({
      error: "Failed to process activity"
    });
  }
}
