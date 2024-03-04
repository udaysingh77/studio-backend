const axios = require('axios');
const mongodb = require('mongodb');
const jwt = require('jsonwebtoken');

// models
const Service = require('../models/service');

// utils
const { homeScreen, collectionName } = require('../config/settings')
const { validateService, validateFilterSchema, validateServiceFilterSchema } = require('../util/validations');
const pick = require('../util/pick')
const { paginate } = require('../util/plugins/paginate.plugin');
const { getDB } = require('../util/database');

const ObjectId = mongodb.ObjectId;





exports.createNewService = async (req, res, next) => {


    const fullName = req.body.serviceName.trim();
    const price = parseFloat(req.body.startingPrice);
    const amenities = req.body.offerings;
    const totalPlans = +req.body.TotalServices;
    const packages = req.body.servicePlans;
    const servicePhotos = req.body.ServicePhotos;
    const aboutUs = req.body.description;
    const workDetails = req.body.portfolio;
    const discographyDetails = req.body.discography;
    const clientPhotos = req.body.userPhotos;
    const reviews = req.body.userReviews;
    const featuredReviews = req.body.starredReviews;

    const { error } = validateService(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }
    // If validation passes, proceed to the next middleware or controller function
    // next();
    
    const serviceObj = new Service(fullName, price, amenities, totalPlans, packages,
        servicePhotos, aboutUs, workDetails, discographyDetails, clientPhotos, reviews, featuredReviews);


    const result_data = await serviceObj.checkBeforeSave(fullName)

    return res.json(result_data);
        // .then(resultData => {
        //     return res.json({ status: true, message: "Service added successfully", data: resultData["ops"][0] });
        // })
        

}

exports.getServices = (req, res, next) => {

    console.log("body---", req.query);
    // const { serviceName, startingPrice, offerings, TotalServices, avgReview, serviceId } = req.query;
    const filter = pick(req.query, ['serviceType', 'active', 'serviceName', 'startingPrice', 'planId'])
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    let mappedFilter = {}

    const collectionName = homeScreen.category?.[filter.serviceType]?.coll

    if (filter.serviceType) mappedFilter.type = filter.serviceType //: filter.catId = 1;
    filter.active ? mappedFilter.isActive = parseInt(filter.active) : mappedFilter.isActive = 1;

    if (filter.planId) {
        var o_id = new ObjectId(filter.planId);
        filter._id = o_id
    }
    if (filter.serviceName) mappedFilter.fullName = serviceName;
    if (filter.startingPrice) mappedFilter.price = startingPrice;
    if (filter.TotalServices) mappedFilter.totalPlans = TotalServices;
    if (filter.avgReview) mappedFilter.featuredReviews.avgService = parseFloat(avgReview);

    console.log("collectionName----", collectionName, mappedFilter, options);

    const { error } = validateFilterSchema(filter);
    if (error) {
        return res.status(400).json({ status: false, message: error.details[0].message });
    }

    paginate(collectionName, mappedFilter, options).then((ServiceData) => {
        return res.json({ status: true, message: `Page ${ServiceData.page} of ${ServiceData.totalPages} - ${ServiceData.totalResults} services returned`, services: ServiceData });
    })

}

exports.getServiceBookings = (req, res, next) => {

    console.log("body---", req.query);

    const { bookingId, userID, serviceID, planID, price, serviceType, dateTime, status, bookingStartTime, bookingEndTime } = req.query;

    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    let filter = {}

    const _collectionName = collectionName.service_bookings


    if (serviceType) filter.type = serviceType;

    if (bookingId) {
        var o_id = new ObjectId(bookingId);
        filter._id = o_id
    }
    if (userID) filter.userId = userID;
    if (serviceID) filter.serviceId = serviceID;
    if (planID) filter.planId = planID;
    if (price) filter.totalPrice = price;
    if (dateTime) filter.creationTimeStamp = dateTime;
    if (status) filter.bookingStatus = status;
    if (bookingStartTime) filter.bookingTime.startTime = bookingStartTime;
    if (bookingEndTime) filter.bookingTime.endTime = bookingEndTime;

    console.log("collectionName----", _collectionName, filter, options);

    const { error } = validateServiceFilterSchema(filter);
    if (error) {
        return res.status(400).json({ status: false, message: error.details[0].message });
    }

    paginate(_collectionName, filter, options).then((ServiceData) => {
        return res.json({ status: true, message: `Page ${ServiceData.page} of ${ServiceData.totalPages} - ${ServiceData.totalResults} service booking returned`, services: ServiceData });
    })

}


exports.getServiceBookingsDetails = async (req, res) => {

    let {last_id}  = req.query || 0

    console.log("last_id:",last_id);
    last_id = last_id === "0"?0:last_id;
    console.log("last_id:",typeof(last_id));


    const db = getDB();
    const pipeline = [
        {
            $match: {
                _id: { $gt: ObjectId(last_id) },
                $or: [
                    { type: { $eq: "c2" } },
                    { type: { $eq: "c3" } }
                ]
            },
            
        },
        {
            $lookup: {
                from: "services",
                let: { serviceIdStr: "$studioId" }, 
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: [ "$_id", { $toObjectId: "$$serviceIdStr" } ] } // convert string serviceId to ObjectId and match with _id
                        }
                    }
                ],
                as: "service"
            }
        },
        {
            $lookup: {
                from: "users",
                let: { userIdStr: "$userId" }, // dfine a variable to hold the string serviceId
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: [ "$_id", { $toObjectId: "$$userIdStr" } ] }
                        }
                    }
                ],
                as: "user"
            }
        },
        {
            $project: {
                serviceFullName: { $arrayElemAt: ["$service.fullName", 0] },
                userFullName: { $arrayElemAt: ["$user.fullName", 0] },
                userPhone: { $arrayElemAt: ["$user.phone", 0] },
                userEmail: { $arrayElemAt: ["$user.email", 0] },
                totalPrice: "$totalPrice",
                type:"$type"
            }
        }
    ];
    

    const data = await db.collection("bookings").aggregate(pipeline).toArray();

    return res.json({ status: true,data})

}

// exports.deleteService = async(req,res)=>{
//     const serviceId = req.params.serviceId;
//     console.log(serviceId);
//     const db = getDB();
//     existingService = await db.collection('services').findOneAndDelete({_id:serviceId})
//     if(!existingService){
//         return res.status(404).json({status:false, message:"No Service with this ID exists"});
//     }
// }


exports.deleteService = async (req, res) => {
    const sId = req.params.serviceId;
    const deleted_result = await Service.deleteServiceById(sId)
    res.send(deleted_result)
};


exports.updateService = async (req,res)=>{
    const sId = req.params.serviceId;
    const fullName = req.body.serviceName.trim();
    const price = parseFloat(req.body.startingPrice);
    const amenities = req.body.offerings;
    const totalPlans = +req.body.TotalServices;
    const packages = req.body.servicePlans;
    const servicePhotos = req.body.ServicePhotos;
    const aboutUs = req.body.description;
    const workDetails = req.body.portfolio;
    const discographyDetails = req.body.discography;
    const clientPhotos = req.body.userPhotos;
    const reviews = req.body.userReviews;
    const featuredReviews = req.body.starredReviews;
    const newData = {fullName,price,amenities,totalPlans,packages,servicePhotos,aboutUs,workDetails,discographyDetails,clientPhotos,reviews,featuredReviews}
    const updated_result = await Service.updateServiceById(sId,newData)
    res.send(updated_result)
}
