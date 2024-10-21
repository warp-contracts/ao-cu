import * as HyperExpress from "hyper-express";
import {mainRoute} from "./routes/main.mjs";
import {resultRoute} from "./routes/result.mjs";
import {subscribeRoute} from "./routes/sse.mjs";
import {subscribeTestRoute} from "./routes/sseTest.mjs";
import {currentStateRoute} from "./routes/currentState.mjs";

export const api_v1_router = new HyperExpress.Router();
api_v1_router.post('/result/:message-identifier', resultRoute);
api_v1_router.get('/current-state/:process-identifier', currentStateRoute);
api_v1_router.get('/subscribe/:process-identifier', subscribeRoute);
api_v1_router.get('/subscribe-test/', subscribeTestRoute);
api_v1_router.get('/', mainRoute);
