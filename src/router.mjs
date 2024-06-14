import * as HyperExpress from "hyper-express";
import {mainRoute} from "./routes/main.mjs";
import {resultRoute} from "./routes/result.mjs";
import {subscribeRoute} from "./routes/sse.mjs";
import {subscribeTestRoute} from "./routes/sseTest.mjs";

export const api_v1_router = new HyperExpress.Router();
api_v1_router.get('/result/:message-identifier', resultRoute);
api_v1_router.get('/subscribe/:process-identifier', subscribeRoute);
api_v1_router.get('/subscribe-test/', subscribeTestRoute);
api_v1_router.get('/', mainRoute);
