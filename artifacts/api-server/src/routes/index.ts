import { Router, type IRouter } from "express";
import healthRouter from "./health";
import savesRouter from "./saves";
import decisionsRouter from "./decisions";
import scrapeRouter from "./scrape";
import demoRouter from "./demo";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/saves", savesRouter);
router.use("/decisions", decisionsRouter);
router.use("/scrape", scrapeRouter);
router.use("/demo", demoRouter);

export default router;
