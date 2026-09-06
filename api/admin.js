import { MongoClient } from "mongodb";

let client;


/* ==========================================
   DATABASE
========================================== */

async function getDb() {

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!client) {

    client = new MongoClient(
      process.env.MONGODB_URI
    );

    await client.connect();

  }

  return client.db(
    process.env.MONGODB_DB ||
    "middle_eastern_mixing"
  );

}


/* ==========================================
   COOKIE
========================================== */

function getCookie(req, name) {

  const cookieHeader =
    req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {

    const [
      key,
      ...valueParts
    ] =
      cookie.trim().split("=");

    if (key === name) {

      return decodeURIComponent(
        valueParts.join("=")
      );

    }

  }

  return null;
}


/* ==========================================
   ADMIN IDS
========================================== */

function getAdminIds() {

  return (
    process.env.ADMIN_USER_IDS || ""
  )
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

}


/* ==========================================
   ADMIN LOG
========================================== */

async function createLog(
  adminLogs,
  data
) {

  await adminLogs.insertOne({
    ...data,
    createdAt: new Date()
  });

}


/* ==========================================
   ADMIN API
========================================== */

export default async function handler(
  req,
  res
) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method not allowed"
    });

  }


  try {

    /* ======================================
       SESSION
    ====================================== */

    const sessionId =
      getCookie(
        req,
        "mem_session"
      );


    if (!sessionId) {

      return res.status(401).json({
        error:
          "You must connect Discord."
      });

    }


    const db =
      await getDb();


    const sessions =
      db.collection("sessions");

    const users =
      db.collection("users");

    const pixels =
      db.collection("pixels");

    const bans =
      db.collection("bans");

    const clans =
      db.collection("clans");

    const adminLogs =
      db.collection("adminLogs");


    /* ======================================
       SESSION LOOKUP
    ====================================== */

    const session =
      await sessions.findOne({
        _id: sessionId
      });


    if (!session) {

      return res.status(401).json({
        error:
          "Invalid session. Please reconnect Discord."
      });

    }


    /* ======================================
       SESSION EXPIRATION
    ====================================== */

    if (
      session.expiresAt &&
      new Date(
        session.expiresAt
      ).getTime() < Date.now()
    ) {

      await sessions.deleteOne({
        _id: sessionId
      });


      res.setHeader(
        "Set-Cookie",
        "mem_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      );


      return res.status(401).json({
        error:
          "Your session has expired."
      });

    }


    const adminUserId =
      session.userId;


    /* ======================================
       ADMIN PERMISSION
    ====================================== */

    const adminIds =
      getAdminIds();


    if (
      !adminIds.includes(
        adminUserId
      )
    ) {

      return res.status(403).json({
        error:
          "You do not have permission to use the admin panel."
      });

    }


    /* ======================================
       ADMIN ACCOUNT
    ====================================== */

    const adminUser =
      await users.findOne({
        _id: adminUserId
      });


    if (!adminUser) {

      return res.status(403).json({
        error:
          "Admin account not found."
      });

    }


    /* ======================================
       REQUEST
    ====================================== */

    const body =
      req.body || {};

    const action =
      body.action;

    const userId =
      body.userId;


    if (!action) {

      return res.status(400).json({
        error:
          "Missing action"
      });

    }


    /* =========================================
       STATS
    ========================================= */

    if (
      action === "stats"
    ) {

      const [
        userCount,
        pixelCount,
        bannedCount,
        clanCount
      ] =
        await Promise.all([

          users.countDocuments({}),

          pixels.countDocuments({}),

          bans.countDocuments({
            active: true
          }),

          clans.countDocuments({})

        ]);


      const placedResult =
        await users.aggregate([
          {
            $group: {
              _id: null,

              total: {
                $sum: {
                  $ifNull: [
                    "$pixelsPlaced",
                    0
                  ]
                }
              }
            }
          }
        ]).toArray();


      const pixelsPlaced =
        placedResult.length
          ? placedResult[0].total
          : 0;


      return res.status(200).json({

        success: true,

        users:
          userCount,

        pixels:
          pixelCount,

        pixelsPlaced,

        banned:
          bannedCount,

        clans:
          clanCount

      });

    }


    /* =========================================
       LIST USERS
    ========================================= */

    if (
      action === "listUsers"
    ) {

      const search =
        typeof body.search === "string"
          ? body.search.trim()
          : "";


      let query = {};


      if (search) {

        const escaped =
          search.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );


        const regex =
          new RegExp(
            escaped,
            "i"
          );


        query = {
          $or: [
            {
              username:
                regex
            },

            {
              discordUsername:
                regex
            },

            {
              _id:
                regex
            }
          ]
        };

      }


      const foundUsers =
        await users
          .find(query)
          .project({
            _id: 1,
            username: 1,
            discordUsername: 1,
            avatar: 1,
            balance: 1,
            pixelsPlaced: 1,
            clanId: 1,
            createdAt: 1,
            updatedAt: 1
          })
          .sort({
            createdAt: -1
          })
          .limit(50)
          .toArray();


      if (!foundUsers.length) {

        return res.status(200).json({
          success: true,
          users: []
        });

      }


      const userIds =
        foundUsers.map(
          user => user._id
        );


      const activeBans =
        await bans
          .find({
            userId: {
              $in: userIds
            },

            active: true
          })
          .project({
            userId: 1
          })
          .toArray();


      const bannedIds =
        new Set(
          activeBans.map(
            ban => ban.userId
          )
        );


      const result =
        foundUsers.map(user => ({
          ...user,

          banned:
            bannedIds.has(
              user._id
            )
        }));


      return res.status(200).json({

        success: true,

        users:
          result

      });

    }


    /* =========================================
       ADMIN LOGS
    ========================================= */

    if (
      action === "logs"
    ) {

      const logs =
        await adminLogs
          .find({})
          .sort({
            createdAt: -1
          })
          .limit(100)
          .toArray();


      return res.status(200).json({

        success: true,

        logs

      });

    }


    /* =========================================
       BAN
    ========================================= */

    if (
      action === "ban"
    ) {

      if (!userId) {

        return res.status(400).json({
          error:
            "Missing userId"
        });

      }


      if (
        userId === adminUserId
      ) {

        return res.status(400).json({
          error:
            "You cannot ban yourself."
        });

      }


      const targetUser =
        await users.findOne({
          _id: userId
        });


      if (!targetUser) {

        return res.status(404).json({
          error:
            "User not found"
        });

      }


      const now =
        new Date();


      await bans.updateOne(

        {
          userId
        },

        {
          $set: {
            userId,

            active:
              true,

            bannedAt:
              now,

            bannedBy:
              adminUserId
          }
        },

        {
          upsert:
            true
        }

      );


      await createLog(
        adminLogs,
        {
          action:
            "ban",

          targetUserId:
            userId,

          adminUserId
        }
      );


      return res.status(200).json({
        success:
          true
      });

    }


    /* =========================================
       UNBAN
    ========================================= */

    if (
      action === "unban"
    ) {

      if (!userId) {

        return res.status(400).json({
          error:
            "Missing userId"
        });

      }


      const targetUser =
        await users.findOne({
          _id: userId
        });


      if (!targetUser) {

        return res.status(404).json({
          error:
            "User not found"
        });

      }


      const now =
        new Date();


      await bans.updateOne(

        {
          userId
        },

        {
          $set: {
            active:
              false,

            unbannedAt:
              now,

            unbannedBy:
              adminUserId
          }
        }

      );


      await createLog(
        adminLogs,
        {
          action:
            "unban",

          targetUserId:
            userId,

          adminUserId
        }
      );


      return res.status(200).json({
        success:
          true
      });

    }


    /* =========================================
       GIVE PIXELS
    ========================================= */

    if (
      action === "givePixels"
    ) {

      if (!userId) {

        return res.status(400).json({
          error:
            "Missing userId"
        });

      }


      const amount =
        Number(
          body.amount
        );


      if (
        !Number.isInteger(
          amount
        ) ||
        amount <= 0 ||
        amount > 100000
      ) {

        return res.status(400).json({
          error:
            "Invalid amount"
        });

      }


      const result =
        await users.updateOne(

          {
            _id:
              userId
          },

          {
            $inc: {
              balance:
                amount
            },

            $set: {
              updatedAt:
                new Date()
            }
          }

        );


      if (
        result.matchedCount === 0
      ) {

        return res.status(404).json({
          error:
            "User not found"
        });

      }


      await createLog(
        adminLogs,
        {
          action:
            "givePixels",

          targetUserId:
            userId,

          adminUserId,

          amount
        }
      );


      return res.status(200).json({

        success:
          true,

        added:
          amount

      });

    }


    /* =========================================
       REMOVE PIXELS
    ========================================= */

    if (
      action === "removePixels"
    ) {

      if (!userId) {

        return res.status(400).json({
          error:
            "Missing userId"
        });

      }


      const amount =
        Number(
          body.amount
        );


      if (
        !Number.isInteger(
          amount
        ) ||
        amount <= 0 ||
        amount > 100000
      ) {

        return res.status(400).json({
          error:
            "Invalid amount"
        });

      }


      const result =
        await users.updateOne(

          {
            _id:
              userId,

            balance: {
              $gte:
                amount
            }
          },

          {
            $inc: {
              balance:
                -amount
            },

            $set: {
              updatedAt:
                new Date()
            }
          }

        );


      if (
        result.matchedCount === 0
      ) {

        const targetUser =
          await users.findOne({
            _id:
              userId
          });


        if (!targetUser) {

          return res.status(404).json({
            error:
              "User not found"
          });

        }


        return res.status(400).json({
          error:
            "User does not have enough pixels."
        });

      }


      await createLog(
        adminLogs,
        {
          action:
            "removePixels",

          targetUserId:
            userId,

          adminUserId,

          amount
        }
      );


      return res.status(200).json({

        success:
          true,

        removed:
          amount

      });

    }


    /* =========================================
       DELETE PIXEL
    ========================================= */

    if (
      action === "deletePixel"
    ) {

      const x =
        Number(
          body.x
        );

      const y =
        Number(
          body.y
        );


      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        x >= 200 ||
        y < 0 ||
        y >= 200
      ) {

        return res.status(400).json({
          error:
            "Invalid coordinates"
        });

      }


      const pixelId =
        `${x}:${y}`;


      const result =
        await pixels.deleteOne({
          _id:
            pixelId
        });


      await createLog(
        adminLogs,
        {
          action:
            "deletePixel",

          targetPixel:
            pixelId,

          adminUserId,

          deleted:
            result.deletedCount > 0
        }
      );


      return res.status(200).json({

        success:
          true,

        deleted:
          result.deletedCount > 0

      });

    }


    /* =========================================
       RESET BOARD
    ========================================= */

    if (
      action === "resetBoard"
    ) {

      const result =
        await pixels.deleteMany({});


      await createLog(
        adminLogs,
        {
          action:
            "resetBoard",

          adminUserId,

          deletedPixels:
            result.deletedCount
        }
      );


      return res.status(200).json({

        success:
          true,

        deleted:
          result.deletedCount

      });

    }


    /* =========================================
       UNKNOWN ACTION
    ========================================= */

    return res.status(400).json({

      error:
        "Unknown action"

    });


  } catch (error) {

    console.error(
      "Admin API error:",
      error
    );


    return res.status(500).json({

      error:
        "Admin operation failed",

      message:
        error.message

    });

  }

}
