import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";
import jwt from "jsonwebtoken";

export interface JwtDoc extends BaseDoc {
  token: string;
}

export default class JwtConcept {
  public readonly jwts: DocCollection<JwtDoc>;

  constructor(name: string) {
    this.jwts = new DocCollection<JwtDoc>(name);
  }

  async create(_id: ObjectId, username: string) {
    // JWT
    const jwt = this.generateJWT(_id.toString(), username);
    const token = await this.jwts.createOne({ _id, token: jwt }, false);

    if (!token) throw new NotFoundError("Jwt not created");
    return token;
  }

  async update(_id: ObjectId, username: string) {
    // JWT
    const jwt = this.generateJWT(_id.toString(), username);
    await this.jwts.partialUpdateOne({ _id }, { token: jwt });
    const token = await this.jwts.readOne({ token: jwt });
    console.log('token", token');
    if (!token) throw new NotFoundError("Jwt not created");
    return token;
  }

  async authenticate(_id: ObjectId, jwt: string) {
    const token = await this.jwts.readOne({ _id });
    if (!token) throw new NotFoundError("No jwt exists for user: " + _id.toString());
    // Replace standard bearer string
    jwt = jwt.replace("Token ", "");
    jwt = jwt.replace("Bearer ", "");
    console.log("jwt", jwt);
    console.log("token", token.token);
    if (token.token.trim() != jwt.trim()) throw new NotAllowedError("Jwt token does not match for request");
    return token;
  }

  private generateJWT(userId: string, username: string) {
    const secretKey = "abc";
    return jwt.sign({ userId, username }, secretKey, { expiresIn: "1h" });
  }
}
