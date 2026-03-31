import "express-serve-static-core";

// Extend Express Request to include Multer file metadata.
declare module "express-serve-static-core" {
    interface Request {
        traceId?: string;
        file?: Express.Multer.File;
        files?:
            | Express.Multer.File[]
            | {
                  [fieldname: string]: Express.Multer.File[];
              };
    }
}
