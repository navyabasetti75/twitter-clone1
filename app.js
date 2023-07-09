const express = require("express");
const path = require("path");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const getFollowingPeopleIdsOfUser = async (username) => {
  const getFollowingPeopleQuery = `
    SELECT
      following_user_id
    FROM 
      follower INNER JOIN user ON user.user_id=follower.follower_user_id
    WHERE 
      user.username='${username}';
    `;
  const followingPeople = await db.all(getFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken) {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;

        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

const tweetsAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `SELECT 
  * 
  FROM tweet INNER JOIN follower 
  ON tweet.user_id=follower.following_user_id 
  WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}'
    ;`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
//API1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `
    SELECT
      *
    FROM
      user
    WHERE
      username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
        INSERT INTO
          user(name,username,password,gender)
        VALUES
          (
        '${name}',
        '${username}',
        '${hashedPassword}',
        '${gender}'
                         
        ) ;`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});
//API2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT
      *
    FROM
      user
    WHERE
      username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched) {
      const payLoad = { username, userId: dbUser.user_id };
      const jwtToken = jwt.sign(payLoad, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});
//API3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username);
  const getTweetsFeedQuery = `
    SELECT username, tweet, date_time AS dateTime FROM user INNER JOIN tweet ON user.user_id=tweet.user_id WHERE user.user_id IN (${followingPeopleIds}) 
    ORDER BY dateTime DESC LIMIT 4 
    ;`;
  const tweetsFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetsFeedArray);
});
//API4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const userFollowsQuery = `
    SELECT name FROM follower INNER JOIN user on user.user_id=follower.following_user_id WHERE follower_user_id = '${userId}';`;
  const userFollowsArray = await db.all(userFollowsQuery);
  response.send(userFollowsArray);
});

//API5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const userFollowersQuery = `
    SELECT DISTINCT name FROM user INNER JOIN follower on user.user_id=follower.follower_user_id WHERE following_user_id = ${userId};`;
  const userFollowersArray = await db.all(userFollowersQuery);
  response.send(userFollowersArray);
});

//API6

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetsAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const tweetsQuery = `
    SELECT tweet,(SELECT COUNT() FROM like WHERE tweet_id='${tweetId}') as likes,
    (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') as replies,
    date_time as dateTime 
    FROM tweet 
    WHERE tweet.tweet_id = '${tweetId}';`;
    const tweetResult = await db.get(tweetsQuery);
    response.send(tweetResult);
  }
);

//API7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  tweetsAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;

    const getLikerUsersQuery = `
    SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id 
    WHERE tweet_id = '${tweetId}';`;
    const likedUsers = await db.all(getLikerUsersQuery);
    const userArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({ likes: userArray });
  }
);
//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetsAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;

    const getRepliedUserQuery = `
    SELECT name,reply 
    FROM user INNER JOIN reply ON user.user_id=reply.user_id 
    WHERE tweet_id = '${tweetId}';`;
    const repliedUsers = await db.all(getRepliedUserQuery);
    response.send({ replies: repliedUsers });
  }
);
//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetsDetailsQuery = `
    SELECT tweet, 
    COUNT(DISTINCT like_id) AS likes, 
    COUNT(DISTINCT reply_id) AS replies,
    date_time AS dateTime 
    FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id LEFT JOIN
    like ON tweet.tweet_id = like.tweet_id 
    WHERE tweet.user_id = '${userId}' 
    GROUP BY tweet.tweet_id

    ;`;
  const tweetDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetDetails);
});
//API10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { userId } = parseInt(request.user_id);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const postTweetQuery = `
    INSERT INTO tweet(tweet,user_id,date_time) VALUES ('${tweet}','${userId}','${dateTime}');`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});
//API11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const selectUserQuery = `
    SELECT * FROM tweet WHERE user_id = '${userId}' and tweet_id = '${tweetId}';`;
    const tweetUser = await db.get(selectUserQuery);
    if (tweetUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
    DELETE FROM tweet WHERE tweet_id = '${tweetId}';`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
