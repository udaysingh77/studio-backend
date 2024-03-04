const mongodb = require("mongodb");
const getDb = require("../util/database").getDB;

const ObjectId = mongodb.ObjectId;

class User {
  constructor({
    fullName,
    dateOfBirth,
    email,
    phone,
    password = "",
    latitude = "",
    longitude = "",
    city = "",
    state = "",
    profileUrl = "",
    role = "user",
    gender = "",
    userType = "NUMBER",
    favourites = [],
    deviceId,
  }) {
    this.fullName = fullName;
    this.dateOfBirth = dateOfBirth;
    this.email = email;
    this.phone = phone;
    this.password = password;
    this.latitude = latitude;
    this.longitude = longitude;
    this.city = city;
    this.state = state;
    this.profileUrl = profileUrl;
    this.role = role;
    this.gender = gender;
    this.userType = userType;
    this.favourites = favourites;
    this.deviceId = deviceId;
    this.creationTimeStamp = new Date();
  }

  save() {
    const db = getDb();
    return db.collection("users").insertOne(this);
  }

  static update(phoneNumber, newData) {
    const db = getDb();
    const userToUpdate = { phone: phoneNumber };
    const updateData = {
      $set: newData,
    };
    return db.collection(collectionName).updateOne(userToUpdate, updateData);
  }

  static findUserByUserId(uId) {
    // console.log("uID-------->",uId);

    var o_id = new ObjectId(uId);
    const db = getDb();

    return db
      .collection("users")
      .findOne({ _id: o_id })
      .then((userData) => {
        return userData;
      })
      .catch((err) => console.log(err));
  }

  static findUserByEmail(email) {
    const db = getDb();

    return db
      .collection("users")
      .findOne({ email: email })
      .then((userData) => {
        return userData;
      })
      .catch((err) => console.log(err));
  }

  static findUserByPhone(phone) {
    const db = getDb();

    return db
      .collection("users")
      .findOne({ phone: phone })
      .then((userData) => {
        return userData;
      })
      .catch((err) => console.log(err));
  }

  static fetchAllUsers(skipCount, limitCount) {
    const db = getDb();
    return db
      .collection("users")
      .find()
      .sort({ creationTimeStamp: -1 })
      .skip(skipCount)
      .limit(limitCount)
      .toArray()
      .then((userData) => {
        return userData;
      })
      .catch((err) => console.log(err));
  }
}

module.exports = User;
