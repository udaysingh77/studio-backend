const User = require('../models/user');
const Admin = require('../models/admin');
const TempUser = require('../models/tempUsers');
const Studio = require('../models/studio');

const mongodb = require('mongodb');
const getDb = require('../util/database').getDB;
const ObjectId = mongodb.ObjectId;

var crypto = require('crypto');
const jwt = require('jsonwebtoken');

const axios = require('axios');
var GeoPoint = require('geopoint');
const httpStatus = require('http-status');

//For Email 
var nodemailer = require('nodemailer');
const { sendOTP, addContactBrevo } = require('../util/mail')

// Sendinblue library\
// const SibApiV3Sdk = require('sib-api-v3-sdk');
// let defaultClient = SibApiV3Sdk.ApiClient.instance;
// Instantiate the client\
// let apiKey = defaultClient.authentications['api-key'];


const secretKey = 'myAppSecretKey'

//FOR ZOHO integration
let transporter = nodemailer.createTransport({
    host: "smtp.zoho.in",
    secure: true,
    port: 465,
    auth: {
        user: process.env.ZOHO_USER,
        pass: process.env.ZOHO_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});


function generateRandomCode(length) {
    // var length = 4,
    charset = "123456789",
        token = "";
    for (var i = 0, n = charset.length; i < length; ++i) {
        token += charset.charAt(Math.floor(Math.random() * n));
    }
    return token;
}

exports.signupUser = async (req, res, next) => {

    const fullName = req.body.fullName.trim();
    const dateOfBirth = req.body.dateOfBirth;
    const email = req.body.email;
    const phone = req.body.phone;
    let password = req.body.password;
    const userType = req.body.userType;
    const deviceId = req.body.deviceId;
    const latitude = "";
    const longitude = "";
    const city = "";
    const state = "";
    const profileUrl = "";
    const gender = "";
    const favourites = [];

    if (userType == "EMAIL") {
        //Encrypting Password
        var hash = crypto.createHash('sha256');
        hash.update(password);
        password = hash.digest('hex');
    }

    User.findUserByEmail(email)
        .then(userData => {
            if (userData) {
                return res.status(409).json({ status: false, message: "User with this Email already exists" });
            }
            User.findUserByPhone(phone)
                .then(userPhoneData => {
                    if (userPhoneData) {
                        return res.status(409).json({ status: false, message: "User with this Phone already exists" });
                    }

                    const userObj = new User(fullName, dateOfBirth, email, phone, password, latitude, longitude, city, state, profileUrl, gender,
                        userType, favourites, deviceId);

                    //saving in database
                    return userObj.save()
                        .then(resultData => {
                            jwt.sign({ user: resultData["ops"][0] }, secretKey, (err, token) => {
                                return res.json({ status: true, message: "Signup successful", user: resultData["ops"][0], token: token });
                            });
                        })
                        .catch(err => console.log(err));
                })
        })

}

exports.loginUserOTP2 = (req, res, next) => {
    console.log("LOGIN-OTP", req.body)
    return res.json({ status: true, message: 'Login-OTP' })
}


// ----------- Auth V 1.1 ------------------------

exports.signupUserV2 = async (req, res, next) => {
    try {
        const { fullName, userType, dateOfBirth, email, phoneNumber,deviceId, role } = req.body;

        console.log({ fullName, dateOfBirth, email, phoneNumber,deviceId });

        // const userData = await TempUser.findUserByPhone(phoneNumber);
        let _userData = await User.findUserByPhone(phoneNumber);

        console.log("REGISTER USER DATA", _userData)

        if (_userData) {
            return res.status(409).json({ status: false, message: "Phone number already registered" });
        }
        const userObj = new User({
            fullName: fullName.trim(),
            dateOfBirth,
            email,
            phone: phoneNumber,
            password: "",
            userType: userType || "NUMBER",
            deviceId,
            latitude: "",
            longitude: "",
            city: "",
            state: "",
            profileUrl: "",
            role: role || "user",
            gender: "",
            favourites: [],
        });
        await userObj.save();
        const token = await jwt.sign({ user: userObj }, "myAppSecretKey");
        // Send OTP
        if (role === "tester" || role === "admin") {
            await addContactBrevo(_userData);
            console.log("Added to Brevo");
        }
        return res.json({ status: true, message: "Signup successful", user: userObj, token });

    } catch (error) {
        console.error("Error in signupUserV2:", error);
        return res.status(500).json({ status: false, message: "Something went wrong, try again later" });
    }
};

exports.loginUserOTP = async (req, res, next) => {
    try {
        console.log("LOGIN======>");
        const { phoneNumber, deviceId, userType, role } = req.body;
        console.log("<=======LOGIN");

        console.log({ phoneNumber, deviceId, userType, role });

        const userData = await User.findUserByPhone(phoneNumber);
        const tempUserData = await TempUser.findUserByPhone(phoneNumber);

        console.log("DATA::::", userData, tempUserData);

        let statusInfo = { status: false, message: "something went wrong" }

        let otp = generateRandomCode(4)

        if (userType === "NUMBER") {
            let token;
            // ADMIN login
            if (role === "admin") {
                const adminData = await Admin.findAdminByNumber(phoneNumber);
                if (adminData) {
                    const AdminData = {
                        id: adminData.adminId,
                        fullName: `${adminData.firstName} ${adminData.lastName}`,
                        emailId: adminData.email,
                        Image: adminData.adminImage,
                        phoneNumber: adminData.phone,
                        role: "admin"
                    }
                    const token = await jwt.sign({ user: userData }, secretKey);
                    return res.json({ status: true, message: "OTP has been send Succesfully", user: AdminData, token, otp });
                }
                return res.json({ status: false, message: "Admin not found" });
            }
            // Test User login
            if (tempUserData && role === "tester") {
                statusInfo.role = "tester"
                console.log("Mobile OTP:", otp);
                if (tempUserData) {
                    if (deviceId) {
                        tempUserData.deviceId = deviceId;
                        await TempUser.update(phoneNumber, { deviceId: deviceId });
                    }
                    const token = await jwt.sign({ user: tempUserData }, secretKey);
                    statusInfo.token = token
                    statusInfo.otp = otp
                    statusInfo.newUser = false
                    statusInfo.status = true
                    statusInfo.user = tempUserData
                    statusInfo.message = "Welcome again, OTP has been send Succesfully."
                }

            }
            // New Test User
            else if (!tempUserData && role === "tester") {
                const tempUser = await TempUser.save({ phoneNumber, userType, deviceId, role });
                statusInfo.newUser = true
                statusInfo.status = true
                statusInfo.otp = otp
                statusInfo.user = tempUser
                statusInfo.message = "OTP has been send Succesfully"
            }
            //user role login
            else {
                // existing user role login
                statusInfo.role = "user"
                if (userData) {
                    userData.deviceId = deviceId;
                    await User.update(phoneNumber, { deviceId: deviceId });
                    const token = await jwt.sign({ user: userData }, secretKey);
                    statusInfo.token = token
                    statusInfo.otp = otp
                    statusInfo.newUser = false
                    statusInfo.status = true
                    statusInfo.user = userData
                    statusInfo.message = "Welcome back, OTP has been send Succesfully"
                // new user role login    
                } else {
                    statusInfo.newUser = true
                    statusInfo.status = true
                    statusInfo.otp = otp
                    statusInfo.user = {
                        "_id": "",
                        "fullName": "",
                        "dateOfBirth": "",
                        "email": "",
                        "phone": "",
                        "password": "",
                        "latitude": "",
                        "longitude": "",
                        "city": "",
                        "state": "",
                        "profileUrl": "",
                        "gender": "",
                        "userType": "NUMBER",
                        "favourites": [],
                        "deviceId": "",
                    }
                }
                statusInfo.message = "OTP has been send Succesfully"
            }
        }
        console.log("-----c:::", statusInfo)
        return res.json(statusInfo);
    } catch (error) {
    console.error("Error in loginUserOTP:", error);
    return res.status(500).json({ message: "Please try after some time" });
}
};

// -----------------------------------------------


exports.TestloginUserOTP = async (req, res, next) => {
    try {
        const { phoneNumber, deviceId, userType } = req.body;
        const fullName = "";
        const dateOfBirth = "";
        const email = "";
        const password = "";
        const latitude = "";
        const longitude = "";
        const city = "";
        const state = "";
        const profileUrl = "";
        const gender = "";
        const favourites = [];

        const statusInfo = { status: false, message: 'something went wrong, try again' };

        const userData = await User.findUserByPhone(phoneNumber);

        console.log("userdata ==========>", userData);

        if (userType === "NUMBER") {
            const token = generateRandomCode(4);
            console.log("test mobile otp:", token);
            statusInfo.message = 'Test OTP sent successfully';
            statusInfo.otp = token;
            statusInfo.status = true;
        }

        if (userData) {
            const db = getDb();
            userData.deviceId = deviceId;
            await db.collection('users').updateOne({ phone: phoneNumber }, { $set: userData });
            const token = await jwt.sign({ user: userData }, secretKey);
            statusInfo.status = true;
            statusInfo.newUser = false;
            statusInfo.user = userData;
            statusInfo.token = token;
        }

        if (!userData && userType === "NUMBER") {
            statusInfo.newUser = true;
            const userObj = new User(fullName, dateOfBirth, email, phoneNumber, password, latitude, longitude, city, state, profileUrl, gender, userType, favourites, deviceId);
            const resultData = await userObj.save();
            statusInfo.status = true;
            statusInfo.user = resultData["ops"][0];



        }

        return res.json(statusInfo);
    } catch (err) {
        console.log("===>", err.message);
        return res.status(200).json({ message: 'Please try after some Time' });
    }
}


exports.loginUser = (req, res, next) => {
    const email = req.body.email;
    let password = req.body.password;
    const deviceId = req.body.deviceId;
    const userType = req.body.userType;
  
    User.findUserByEmail(email).then(async (userData) => {
      if (!userData) {
        return res
          .status(404)
          .json({ status: false, message: "No User with this email exists" });
      }
  
      if (userData.userType != userType) {
        return res.json({
          status: false,
          message: userData.userType + " login required for this user",
        });
      }
  
      if (userType == "EMAIL") {
        //Encrypting Password
        var hash = crypto.createHash("sha256");
        hash.update(password);
        password = hash.digest("hex");
  
        if (userData.password != password) {
          return res
            .status(401)
            .json({ status: false, message: "Incorrect password" });
        }
      }
  
      userData.deviceId = deviceId;
  
      jwt.sign({ user: userData }, secretKey, (err, token) => {
        if (err) {
          console.error("Error generating JWT token:", err);
          return res
            .status(500)
            .json({ status: false, message: "Internal Server Error" });
        }
  
        // Update user document with token
        const db = getDb();
        db.collection("users")
          .updateOne(
            { email: email },
            { $set: { ...userData, refreshToken: token } }
          )
          .then((resultData) => {
            res.json({
              status: true,
              message: "Successfully Logged In",
              user: userData,
              token: token,
            });
          })
          .catch((err) => {
            console.error("Error updating user document:", err);
            res
              .status(500)
              .json({ status: false, message: "Internal Server Error" });
          });
      });
    });
  };


exports.sendSignUpOtp = (req, res, next) => {

    console.log("SEND SIGN UP OTP");

    const email = req.body.email;
    const phone = req.body.phone;

    User.findUserByEmail(email)
        .then(userData => {
            if (userData) {
                return res.status(409).json({ status: false, message: "User already exist with this email" });
            }
            User.findUserByPhone(phone)
                .then(userDataPhone => {
                    if (userDataPhone) {
                        return res.status(409).json({ status: false, message: "User already exist with this phone" });
                    }
                    let token = generateRandomCode(4);
                    console.log("phone token otp :", token)
                    // let token = "123456";
                    //send OTP to both email and OTP
                    //To Phone
                    axios.get("https://www.fast2sms.com/dev/bulkV2?authorization=" + process.env.FAST2SMS_AUTH_KEY + "&variables_values" + token + "&route=otp&numbers=" + phone)
                        .then(function (response) {
                            // console.log(response.data);
                            if (response.data != undefined && response.data.return == true && response.data.message[0] == "SMS sent successfully.") {
                                // return res.json({status:true, message:"OTP sent successfully", otp:token});
                                //Send OTP to EMAIL
                                const mailOptions = {
                                    from: process.env.ZOHO_USER, // sender address
                                    to: email,
                                    subject: 'Choira Studio | Email verification OTP',
                                    html: "You requested for account signup. Your Token : " + token // plain text body
                                };

                                transporter.sendMail(mailOptions, function (error, info) {
                                    if (error) {
                                        console.log(error);
                                        return res.json({ status: false, message: "Error Occured", error: error });
                                    } else {
                                        console.log('Email sent: ' + info.response);
                                        return res.json({ status: true, message: "OTP sent successfully", otp: token });
                                    }
                                });
                            }
                            else {
                                return res.status(400).json({ status: false, message: "OTP not sent" });
                            }
                        })
                })
        })

}


exports.getAllUsers = (req, res, next) => {

    let skip = +req.query.skip;
    let limit = +req.query.limit;

    if (isNaN(skip)) {
        skip = 0;
        limit = 0;
    }

    User.fetchAllUsers(skip, limit)
        .then(userData => {
            return res.json({ status: true, message: "All Users returned", users: userData });
        })

}


exports.getParticularUserDetails = (req, res, next) => {

    const userId = req.params.userId;

    console.log("userId===>", userId);

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.status(404).json({ status: false, message: "No User with this ID exists" });
            }
            return res.json({ status: true, message: "User Exists", user: userData });
        })
}


exports.addEditUserLocation = (req, res, next) => {

    const userId = req.params.userId;

    const latitude = req.body.latitude;
    const longitude = req.body.longitude;
    const city = req.body.city;
    const state = req.body.state;

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.status(404).json({ status: false, message: "No User with this ID exists" });
            }

            userData.latitude = latitude;
            userData.longitude = longitude;
            userData.city = city;
            userData.state = state;

            const db = getDb();
            var o_id = new ObjectId(userId);

            db.collection('users').updateOne({ _id: o_id }, { $set: userData })
                .then(resultData => {
                    jwt.sign({ user: userData }, secretKey, (err, token) => {
                        return res.json({ status: true, message: 'User location updated successfully', user: userData, token: token });
                    });
                })
                .catch(err => console.log(err));
        })

}


exports.editUserProfile = (req, res, next) => {

    const userId = req.params.userId;

    const fullName = req.body.fullName;
    const dateOfBirth = req.body.dateOfBirth;
    const profileUrl = req.body.profileUrl;
    const gender = req.body.gender;

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.status(404).json({ status: false, message: "No User with this ID exists" });
            }

            userData.fullName = fullName;
            userData.dateOfBirth = dateOfBirth;
            userData.profileUrl = profileUrl;
            userData.gender = gender;

            const db = getDb();
            var o_id = new ObjectId(userId);

            db.collection('users').updateOne({ _id: o_id }, { $set: userData })
                .then(resultData => {
                    jwt.sign({ user: userData }, secretKey, (err, token) => {
                        return res.json({ status: true, message: 'User details updated successfully', user: userData, token: token });
                    });
                })
                .catch(err => console.log(err));
        })

}


exports.sendEmailOtpForEdit = (req, res, next) => {

    const email = req.body.email;

    let token = generateRandomCode(6);
    // let token = "123456";

    User.findUserByEmail(email)
        .then(userData => {
            if (userData) {
                return res.status(409).json({ status: false, message: "User with this Email already exists" });
            }
            // return res.json({status:true, message:"OTP sent successfully", otp:token});
            const mailOptions = {
                from: process.env.ZOHO_USER, // sender address
                to: email,
                subject: 'Choira Studio | Email verification OTP',
                html: "You requested for email verification. Your Token : " + token // plain text body
            };

            transporter.sendMail(mailOptions, function (error, info) {
                if (error) {
                    console.log(error);
                    return res.json({ status: false, message: "Error Occured", error: error });
                } else {
                    console.log('Email sent: ' + info.response);
                    return res.json({ status: true, message: "OTP sent successfully", otp: token });
                }
            });
        })

}


function checkEmailAvailability(userId, email, _callBack) {
    User.findUserByUserId(userId)
        .then(userDoc => {
            if (!userDoc) {
                _callBack(false, "No user with this ID exists");
                return;
            }
            User.findUserByEmail(email)
                .then(userNew => {
                    if (!userNew) {
                        _callBack(true, "New Email");
                        return;
                    }
                    else if (userNew.email == userDoc.email) {
                        _callBack(true, "Same Email");
                        return;
                    }
                    else if (userNew.email != userDoc.email) {
                        _callBack(false, "Email already used by another user");
                        return;
                    }
                })
        })
}

exports.editUserEmail = (req, res, next) => {

    const userId = req.params.userId;
    const email = req.body.email;

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.json({ status: false, message: "No User with this ID exists" });
            }
            checkEmailAvailability(userId, email, (valStatus, valMsg) => {
                if (!valStatus) {
                    return res.json({ status: false, message: valMsg });
                }
                userData.email = email;

                const db = getDb();
                var o_id = new ObjectId(userId);
                db.collection('users').updateOne({ _id: o_id }, { $set: userData })
                    .then(resultData => {
                        jwt.sign({ user: userData }, secretKey, (err, token) => {
                            res.json({ status: true, message: 'Email updated successfully', user: userData, token: token });
                        });
                    })
                    .catch(err => console.log(err));
            })
        })

}


exports.sendPhoneOtpForEdit = (req, res, next) => {

    console.log("OTPPP=>");

    const phone = req.body.phone;

    let token = generateRandomCode(6);
    // let token = "123456";

    User.findUserByPhone(phone)
        .then(userData => {
            if (userData) {
                return res.status(409).json({ status: false, message: "User with this Phone already exists" });
            }
            // return res.json({status:true, message:"OTP sent successfully", otp:token});
            axios.get("https://www.fast2sms.com/dev/bulkV2?authorization=" + process.env.FAST2SMS_AUTH_KEY + "&variables_values" + token + "&route=otp&numbers=" + phone)
                .then(function (response) {
                    if (response.data != undefined && response.data.return == true && response.data.message[0] == "SMS sent successfully.") {
                        return res.json({ status: true, message: "OTP sent successfully", otp: token });
                    }
                    else {
                        return res.status(400).json({ status: false, message: "OTP not sent" });
                    }
                })
        })

}


function checkPhoneAvailability(userId, phone, _callBack) {
    User.findUserByUserId(userId)
        .then(userDoc => {
            if (!userDoc) {
                _callBack(false, "No user with this ID exists");
                return;
            }
            User.findUserByPhone(phone)
                .then(userNew => {
                    if (!userNew) {
                        _callBack(true, "New phone");
                        return;
                    }
                    else if (userNew.phone == userDoc.phone) {
                        _callBack(true, "Same phone");
                        return;
                    }
                    else if (userNew.phone != userDoc.phone) {
                        _callBack(false, "Phone already used by another user");
                        return;
                    }
                })
        })
}

exports.editUserPhone = (req, res, next) => {

    const userId = req.params.userId;
    const phone = req.body.phone;

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.json({ status: false, message: "No User with this ID exists" });
            }
            checkPhoneAvailability(userId, phone, (valStatus, valMsg) => {
                if (!valStatus) {
                    return res.json({ status: false, message: valMsg });
                }
                userData.phone = phone;

                const db = getDb();
                var o_id = new ObjectId(userId);
                db.collection('users').updateOne({ _id: o_id }, { $set: userData })
                    .then(resultData => {
                        jwt.sign({ user: userData }, secretKey, (err, token) => {
                            res.json({ status: true, message: 'Phone updated successfully', user: userData, token: token });
                        });
                    })
                    .catch(err => console.log(err));
            })
        })

}


exports.editUserPasswordDetails = (req, res, next) => {

    const userId = req.params.userId;

    let currentPassword = req.body.currentPassword;
    let newPassword = req.body.newPassword;

    //Encrypting Password
    var hash = crypto.createHash('sha256');
    hash.update(currentPassword);
    currentPassword = hash.digest('hex');

    var hash = crypto.createHash('sha256');
    hash.update(newPassword);
    newPassword = hash.digest('hex');

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.status(404).json({ status: false, message: "No User with this ID exists" });
            }

            if (userData.password != currentPassword) {
                return res.status(400).json({ status: false, message: "Please enter valid current password" });
            }

            if (currentPassword == newPassword) {
                return res.status(400).json({ status: false, message: "New password should not be same as old password" });
            }

            userData.password = newPassword;

            const db = getDb();
            var o_id = new ObjectId(userId);

            db.collection('users').updateOne({ _id: o_id }, { $set: userData })
                .then(resultData => {
                    jwt.sign({ user: userData }, secretKey, (err, token) => {
                        return res.json({ status: true, message: 'Password changed successfully', user: userData, token: token });
                    });
                })
                .catch(err => console.log(err));
        })

}


exports.sendForgotPasswordOtp = (req, res, next) => {

    const identity = req.body.identity;
    const identityType = +req.body.identityType;  //0-> Email, 1-> Phone

    let token = generateRandomCode(6);
    // let token = "123456";

    if (identityType == 0) {
        User.findUserByEmail(identity)
            .then(userData => {
                if (!userData) {
                    return res.status(404).json({ status: false, message: "No User exists with this email" });
                }
                // return res.json({status:true, message:"OTP sent successfully", otp:token});            
                const mailOptions = {
                    from: process.env.ZOHO_USER, // sender address
                    to: identity,
                    subject: 'Choira Studio | Password Reset OTP',
                    html: "You requested a password reset. Your Token : " + token // plain text body
                };

                transporter.sendMail(mailOptions, function (error, info) {
                    if (error) {
                        console.log(error);
                        return res.json({ status: false, message: "Error Occured", error: error });
                    } else {
                        console.log('Email sent: ' + info.response);
                        return res.json({ status: true, message: "OTP sent successfully", otp: token });
                    }
                });
            })
    }
    else if (identityType == 1) {
        User.findUserByPhone(identity)
            .then(userData => {
                if (!userData) {
                    return res.status(404).json({ status: false, message: "No User exists with this phone" });
                }
                axios.get("https://www.fast2sms.com/dev/bulkV2?authorization=" + process.env.FAST2SMS_AUTH_KEY + "&variables_values" + token + "&route=otp&numbers=" + identity)
                    .then(function (response) {
                        if (response.data != undefined && response.data.return == true && response.data.message[0] == "SMS sent successfully.") {
                            return res.json({ status: true, message: "OTP sent successfully", otp: token });
                        }
                        else {
                            return res.status(400).json({ status: false, message: "OTP not sent" });
                        }
                    })
            })
    }
    else {
        return res.status(400).json({ status: false, message: "Enter valid identity type" });
    }

}


exports.editUserPassword = (req, res, next) => {

    const identity = req.body.identity;
    const identityType = +req.body.identityType;  //0-> Email, 1-> Phone
    let newPassword = req.body.newPassword;

    //Encrypting Password
    var hash = crypto.createHash('sha256');
    hash.update(newPassword);
    newPassword = hash.digest('hex');

    const db = getDb();

    if (identityType == 0) {
        User.findUserByEmail(identity)
            .then(userData => {
                if (!userData) {
                    return res.status(404).json({ status: false, message: "No User exists with this email" });
                }

                if (userData.password == newPassword) {
                    return res.status(409).json({ status: false, message: "New password must not be same as old password" });
                }

                //Update password
                userData.password = newPassword;

                db.collection('users').updateOne({ email: identity }, { $set: userData })
                    .then(resultData => {
                        return res.json({ status: true, message: 'Password updated successfully', user: userData });
                    })
                    .catch(err => console.log(err));
            })
    }
    else if (identityType == 1) {
        User.findUserByPhone(identity)
            .then(userData => {
                if (!userData) {
                    return res.status(404).json({ status: false, message: "No User exists with this phone" });
                }
                //Update password
                userData.password = newPassword;

                db.collection('users').updateOne({ phone: identity }, { $set: userData })
                    .then(resultData => {
                        return res.json({ status: true, message: 'Password updated successfully', user: userData });
                    })
                    .catch(err => console.log(err));
            })
    }
    else {
        return res.status(400).json({ status: false, message: "Enter valid identity type" });
    }

}


exports.addRemoveUserFavourites = (req, res, next) => {

    const userId = req.body.userId;
    const studioId = req.body.studioId;

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.status(404).json({ status: false, message: "No User with this ID exists" });
            }

            if (studioId != undefined) {
                Studio.findStudioById(studioId)
                    .then(studioData => {
                        if (!studioData) {
                            return res.status(404).json({ status: false, message: "No Studio with this ID exists" });
                        }

                        let resMsg = "";
                        const index = userData.favourites.findIndex(i => i == studioId);
                        if (index != -1) {
                            //remove from array
                            userData.favourites.splice(index, 1);
                            resMsg = "Studio removed from favourites";
                        }
                        else {
                            //add to array
                            userData.favourites.push(studioId);
                            resMsg = "Studio added to favourites";
                        }

                        const db = getDb();
                        var o_id = new ObjectId(userId);

                        db.collection('users').updateOne({ _id: o_id }, { $set: userData })
                            .then(resultData => {
                                if (userData.favourites.length == 0) {
                                    return res.json({ status: true, message: resMsg, user: userData, allFavourites: [] });
                                }
                                else {
                                    let mappedFavourites = [];
                                    let count = 0;
                                    let allFavourites = userData.favourites.map(async f => {
                                        let studioData = await Studio.findStudioById(f);
                                        if (studioData != null) {
                                            mappedFavourites.push(studioData);
                                        }
                                        count = count + 1;
                                        if (count == userData.favourites.length) {
                                            return res.json({ status: true, message: resMsg, user: userData, allFavourites: mappedFavourites });
                                        }
                                    });
                                }
                            })
                            .catch(err => console.log(err));
                    })
            }
            else {
                return res.json({ status: true, message: "User data returned", user: userData });
            }
        })

}


exports.getAllFavourites = (req, res, next) => {

    const userId = req.params.userId;

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.status(404).json({ status: false, message: "No User with this ID exists" });
            }

            if (userData.favourites.length == 0) {
                return res.json({ status: true, message: "All favourites returned", favourites: [] });
            }
            else {
                let mappedFavourites = [];
                let count = 0;
                let allFavourites = userData.favourites.map(async f => {
                    let studioData = await Studio.findStudioById(f);
                    if (studioData != null) {
                        mappedFavourites.push(studioData);
                    }
                    count = count + 1;
                    if (count == userData.favourites.length) {
                        return res.json({ status: true, message: "All favourites returned", favourites: mappedFavourites });
                    }
                });
            }
        })

}


exports.deleteParticularUser = (req, res, next) => {

    const userId = req.params.userId;

    User.findUserByUserId(userId)
        .then(userData => {
            if (!userData) {
                return res.status(404).json({ status: false, message: "No User with this ID exists" });
            }

            const db = getDb();
            var o_id = new ObjectId(userId);

            db.collection('users').deleteOne({ _id: o_id })
                .then(resultData => {
                    return res.json({ status: true, message: 'User deleted successfully' });
                })
                .catch(err => console.log(err));
        })

}


exports.getAllDashboardCount = (req, res, next) => {

    const db = getDb();
    db.collection('users').count().then(resData => {
        db.collection('studios').count().then(resData1 => {
            db.collection('bookings').count().then(resData2 => {
                return res.json({ status: true, message: "All counts returned", users: resData, studios: resData1, bookings: resData2 });
            });
        });
    });

}


exports.getAllUsersGraphDetails = (req, res, next) => {

    var today = new Date();
    // var today = new Date();
    var d;
    var months = [];
    var d = new Date();
    var month;
    var year = d.getFullYear();
    // console.log(year)

    //for last 6 months(including current month)
    // for(var i = 5; i > -1; i -= 1) {
    var keyData = 1;
    //for last 6 months(excluding current month)
    for (var i = 6; i > 0; i -= 1) {
        d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        //   console.log(d.getFullYear())

        months.push({ month: d.getMonth(), year: d.getFullYear(), key: keyData, userCount: 0 });
        keyData = keyData + 1;
    }
    console.log(months);

    User.fetchAllUsers(0, 0)
        .then(usersData => {
            usersData.forEach(user => {
                // console.log(user.creationTimeStamp);
                var dt1 = new Date(user.creationTimeStamp);
                var monthOnly = dt1.getMonth();

                months.forEach(mth => {

                    if ((+mth.month) == (+monthOnly)) {
                        mth.userCount = mth.userCount + 1;
                    }
                })
            })

            setTimeout(() => {
                months.forEach(mthData => {
                    if (mthData.month == 0) {
                        mthData.month = "January"
                    }
                    if (mthData.month == 1) {
                        mthData.month = "Febuary"
                    }
                    if (mthData.month == 2) {
                        mthData.month = "March"
                    }
                    if (mthData.month == 3) {
                        mthData.month = "April"
                    }
                    if (mthData.month == 4) {
                        mthData.month = "May"
                    }
                    if (mthData.month == 5) {
                        mthData.month = "June"
                    }
                    if (mthData.month == 6) {
                        mthData.month = "July"
                    }
                    if (mthData.month == 7) {
                        mthData.month = "August"
                    }
                    if (mthData.month == 8) {
                        mthData.month = "September"
                    }
                    if (mthData.month == 9) {
                        mthData.month = "Ocober"
                    }
                    if (mthData.month == 10) {
                        mthData.month = "November"
                    }
                    if (mthData.month == 11) {
                        mthData.month = "December"
                    }

                });

                months.sort((a, b) => {
                    return a.key - b.key;
                });

                //retrieving only months
                var allMonths = [];
                months.forEach(m => {
                    allMonths.push(m.month);
                });

                //retrieving only userCounts
                var allUserCounts = [];
                months.forEach(m => {
                    allUserCounts.push(m.userCount);
                });

                res.json({ status: true, message: "All data returned", allMonths: allMonths, allUserCounts: allUserCounts, allData: months });
            }, 1000);

        })

}

exports.getUserNearyByLocations = (req, res, next) => {
    const latitude = 19.1196773;
    const longitude = 72.9050809;
    const range = 100;
    var point1 = new GeoPoint(+latitude, +longitude);
    console.log("point1", point1)
    return res.json({ 'msg': 'near by places' })
}
