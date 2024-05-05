import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

  // Table
    const FileTable = new dynamodb.Table(this, 'FileTable', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'FileName', type: dynamodb.AttributeType.STRING },
      tableName: 'FileTable',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });
  
  // Integration infrastructure

  const rejectedMailsQueue = new sqs.Queue(this, "rejected-mailer-queue", {
    receiveMessageWaitTime: cdk.Duration.seconds(10),
    retentionPeriod: cdk.Duration.minutes(30),
});

  const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
    receiveMessageWaitTime: cdk.Duration.seconds(10),
    deadLetterQueue:{
      queue: rejectedMailsQueue,
      maxReceiveCount: 1,
    },
  });


  const mailerQ = new sqs.Queue(this, "mailer-queue", {
    receiveMessageWaitTime: cdk.Duration.seconds(10),
  });

  const newImageTopic = new sns.Topic(this, "NewImageTopic", {
    displayName: "New Image topic",
  }); 

  const modifiedImageTopic = new sns.Topic(this, "ModifiedImageTopic", {
    displayName: "Modified Image topic",
});


  // Lambda functions

  const processImageFn = new lambdanode.NodejsFunction(
    this,
    "ProcessImageFn",
    {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/processImage.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        REGION: cdk.Aws.REGION,
        TABLE_NAME: FileTable.tableName,
    },
    }
  );

  const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
    runtime: lambda.Runtime.NODEJS_16_X,
    memorySize: 1024,
    timeout: cdk.Duration.seconds(3),
    entry: `${__dirname}/../lambdas/mailer.ts`,
  });
//add rejectionMailerFn
  const rejectionMailerFn = new lambdanode.NodejsFunction(this, "rejection-mailer-function", {
    runtime: lambda.Runtime.NODEJS_16_X,
    memorySize: 1024,
    timeout: cdk.Duration.seconds(3),
    entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
});
// add deleteImageFn
const deleteImageFn = new lambdanode.NodejsFunction(this, "delete-image-function", {
  runtime: lambda.Runtime.NODEJS_16_X,
  memorySize: 1024,
  timeout: cdk.Duration.seconds(3),
  entry: `${__dirname}/../lambdas/deleteImage.ts`,
  environment: {
      REGION: cdk.Aws.REGION,
      TABLE_NAME: FileTable.tableName,
  },
});

// add updateImageFn
const updateImageFn = new lambdanode.NodejsFunction(this, "update-image-function", {
  runtime: lambda.Runtime.NODEJS_16_X,
  memorySize: 1024,
  timeout: cdk.Duration.seconds(3),
  entry: `${__dirname}/../lambdas/updateImage.ts`,
  environment: {
      REGION: cdk.Aws.REGION,
      TABLE_NAME: FileTable.tableName,
  },
});


 // S3 --> SQS
 imagesBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.SnsDestination(newImageTopic)  // Changed
);
imagesBucket.addEventNotification(
  s3.EventType.OBJECT_REMOVED,
  new s3n.SnsDestination(modifiedImageTopic)  // Changed 
);
 // SQS --> Lambda
  const newImageEventSource = new events.SqsEventSource(imageProcessQueue , {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(10),
  });

  newImageTopic.addSubscription(
    new subs.SqsSubscription(imageProcessQueue)
  );

  processImageFn.addEventSource(newImageEventSource);

  const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(10),
  }); 

  const newImageRejectionMailEventSource = new events.SqsEventSource(rejectedMailsQueue,{
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(10),
  });

  modifiedImageTopic.addSubscription(
    new subs.LambdaSubscription(deleteImageFn,{
        filterPolicy: {
            extension: sns.SubscriptionFilter.stringFilter({
                allowlist: [".jpeg", ".png"],
            }),
        },
    })
);
modifiedImageTopic.addSubscription(
  new subs.LambdaSubscription(updateImageFn,{
      filterPolicy: {
        comment_type: sns.SubscriptionFilter.stringFilter({
          allowlist: ["Caption"],
          }),
      },
  })
);


  newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));
  newImageTopic.addSubscription(new subs.SqsSubscription(rejectedMailsQueue));
  mailerFn.addEventSource(newImageMailEventSource);
  rejectionMailerFn.addEventSource(newImageRejectionMailEventSource);

  mailerFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
      ],
      resources: ["*"],
    })
  );
  


  // Permissions

  imagesBucket.grantRead(processImageFn);

// Add SES to reject mailer

rejectionMailerFn.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "ses:SendEmail",
      "ses:SendRawEmail",
      "ses:SendTemplatedEmail",
    ],
    resources: ["*"],
  })
);

FileTable.grantReadWriteData(processImageFn);
FileTable.grantReadWriteData(deleteImageFn);
FileTable.grantReadWriteData(updateImageFn);
  // Output
  
  new cdk.CfnOutput(this, "bucketName", {
    value: imagesBucket.bucketName,
  });
  new cdk.CfnOutput(this, "topicName", {
    value: modifiedImageTopic.topicArn,
  });
  }
}
