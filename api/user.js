js
import { MongoClient } from "mongodb";

let client;

async function getDb() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }

  return client.db(
    process.env.MONGODB_DB || "middle_eastern_mixing"
  );
}

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const userId =
      req.query.userId;

    if (!userId) {
      return res.status(400).json({
        error: "Missing userId"
      });
    }

    const db = await getDb();

    const user =
      await db.collection("users").findOne({
        _id: userId
      });

    if (!user) {

      return res.status(404).json({
        error: "User not found"
      });

    }

    return res.status(200).json({

      success: true,

      user: {
        id: user._id,
        username: user.username || "Guest",
        balance: user.balance || 0,
        pixelsPlaced:
          user.pixelsPlaced || 0,
        clanId:
          user.clanId || null,
        lastPlacement:
          user.lastPlacement || null
      }

    });

  } catch (error) {

    console.error(
      "User API error:",
      error
    );

    return res.status(500).json({
      error: "Failed to load user"
    });

  }

}

