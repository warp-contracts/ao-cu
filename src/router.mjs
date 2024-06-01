import * as HyperExpress from "hyper-express";
import {mainRoute} from "./routes/main.mjs";
import {resultRoute} from "./routes/result.mjs";
import {subscribeRoute} from "./routes/sse.mjs";

export const corsMiddleware = async(request, response, next) => {
  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET, PUT, DELETE')
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
}

export const api_v1_router = new HyperExpress.Router();
api_v1_router.get('/result/:message-identifier', resultRoute);
api_v1_router.get('/subscribe/:process-identifier', subscribeRoute)
  .use(corsMiddleware);
api_v1_router.get('/', mainRoute);