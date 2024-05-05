# Distributed Systems - Assignment 2

_Student Name:_ Yangqing Li

## Phase 1
+ Phase 1 Requirement fully implemented.
+ Confirmation Mailer - mailer.ts
  + after upload an image, will get a email confirm that the upload is successful
+ Rejection Mailer - rejectionMailer.ts
  + when upload image style isn't jpeg or png then will get an email failed upload
+ Process Image - processImage.ts
  + add only jpeg or png image to DynamoDB 

## Phase 2
+ Phase 2 Requirement fully implemented
+ Process Delete - deleteImage.ts
  + use AWS CLI to delete object from bucket,bucket publish this event on a topic2,delete item in the table
+ Process Update - updateImage.ts; attributes.json; message.json
  + use AWS CLI add an image caption

## Phase 3
+ Phase 3 Requirement fully implemented
+ Delete Mailer - deleteMailer.ts
  + send a email tell delete seccussful after delete
