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
    const db = await getDb();

    const pixels = await db
      .collection("pixels")
      .find({})
      .project({
        _id: 1,
        x: 1,
        y: 1,
        color: 1,
        userId: 1,
        username: 1,
        clanId: 1,
        placedAt: 1
      })
      .toArray();

    return res.status(200).json({
      success: true,
      pixels
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to load board"
    });
  }
}
