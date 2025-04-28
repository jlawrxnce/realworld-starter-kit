import { ObjectId } from "mongodb";

import { BaseDoc } from "../framework/doc";
import { NotAllowedError } from "./errors";
import jwt from "jsonwebtoken";

export interface JwtDoc extends BaseDoc {
  token: string;
}

export default class JwtConcept {
  private secret = "abc";

  constructor() {}

  async create(_id: ObjectId, username: string) {
    // JWT
    const jwt = this.generateJWT(_id.toString(), username);
    return jwt;
  }

  async update(_id: ObjectId, username: string) {
    // JWT
    const jwt = this.generateJWT(_id.toString(), username);
    return jwt;
  }

  async authenticate(user_jwt: string) {
    user_jwt = user_jwt.replace("Token ", "");
    try {
      // Verify will throw if signature is invalid or token is expired
      const decoded = jwt.verify(user_jwt, this.secret) as jwt.JwtPayload;
      return new ObjectId(decoded.userId);
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new NotAllowedError("Invalid token: " + error.message);
      }
      throw error;
    }
  }

  private generateJWT(userId: string, username: string) {
    return jwt.sign({ userId, username }, this.secret, { expiresIn: "1h" });
  }
}
