import AWS from 'aws-sdk'
import inquirer from 'inquirer'
import { policySchema, type UserBucketPrompt } from './types'
import type { CORSRules } from 'aws-sdk/clients/s3'
import fs from 'fs'
import { z } from 'zod'
import { openInEditor } from 'bun'

export const createIamObject = ({ region }: { region?: string } = {}) => {
    return new AWS.IAM({
        region: region || Bun.env.AWS_DEFAULT_REGION!,
        credentials: {
            accessKeyId: Bun.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY!,
        },
    })
}

export const createS3Object = ({ region }: { region?: string } = {}) => {
    return new AWS.S3({
        region: region || Bun.env.AWS_DEFAULT_REGION!,
        credentials: {
            accessKeyId: Bun.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY!,
        },
    })
}

export const createUser = async ({
    username,
    region,
}: {
    username: string
    region?: string
}) => {
    const iam = createIamObject({ region })
    await iam.createUser({ UserName: username }).promise()
}

export const createPolicy = async ({
    policyName,
    policyDocument,
    region,
}: {
    policyName: string
    policyDocument: string
    region?: string
}) => {
    const iam = createIamObject({ region })
    await iam
        .createPolicy({
            PolicyName: policyName,
            PolicyDocument: policyDocument,
        })
        .promise()
}

export const createAccessKey = async ({
    username,
    region,
}: {
    username: string
    region?: string
}) => {
    const iam = createIamObject({ region })
    const { AccessKey } = await iam
        .createAccessKey({ UserName: username })
        .promise()

    return { ...AccessKey }
}

export const attachUserPolicy = async ({
    username,
    policyArn,
    region,
}: {
    username: string
    policyArn: string
    region?: string
}) => {
    const iam = createIamObject({ region })
    await iam
        .attachUserPolicy({ UserName: username, PolicyArn: policyArn })
        .promise()
}

export const createS3Bucket = async ({
    bucketName,
    region,
}: {
    bucketName: string
    region?: string
}) => {
    const s3 = createS3Object({ region })
    await s3
        .createBucket({
            Bucket: bucketName,
        })
        .promise()
}

export const attachBucketCors = async ({
    bucketName,
    corsConfiguration,
    region,
}: {
    bucketName: string
    corsConfiguration: CORSRules
    region?: string
}) => {
    const s3 = createS3Object({ region })
    await s3
        .putBucketCors({
            Bucket: bucketName,
            CORSConfiguration: {
                CORSRules: corsConfiguration,
            },
        })
        .promise()
}

export const attachPublicBucketPolicy = async ({
    bucketName,
    region,
}: {
    bucketName: string
    region?: string
}) => {
    const s3 = createS3Object({ region })
    await s3
        .putPublicAccessBlock({
            Bucket: bucketName,
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: false,
                IgnorePublicAcls: false,
                RestrictPublicBuckets: false,
                BlockPublicPolicy: false,
            },
        })
        .promise()
    await s3
        .putBucketPolicy({
            Bucket: bucketName,
            Policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Sid: 'PublicReadGetObject',
                        Effect: 'Allow',
                        Principal: '*',
                        Action: ['s3:GetObject'],
                        Resource: [`arn:aws:s3:::${bucketName}/public/*`],
                    },
                ],
            }),
        })
        .promise()
}

export const getDefaultUserPolicy = async ({
    bucketName,
    region,
}: {
    bucketName: string
    region?: string
}) => {
    await createPolicy({
        policyName: `default-${bucketName}-policy`,
        policyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Action: ['s3:PutObject', 's3:GetObject'],
                    Resource: [`arn:aws:s3:::${bucketName}/*`],
                },
            ],
        }),
        region,
    })

    console.log('Policy created')

    return `arn:aws:iam::${Bun.env.AWS_ACCOUNT_ID}:policy/default-${bucketName}-policy`
}

export const userBucketPrompt = async () => {
    const response = await inquirer.prompt([
        {
            type: 'input',
            name: 'bucketName',
            message: 'Enter a unique bucket name:',
            validate(input: string | null | undefined) {
                if (!input) {
                    return 'Please enter a bucket name'
                }
                if (input.length < 3) {
                    return 'Bucket name must be at least 3 characters long'
                }
                if (input.length > 63) {
                    return 'Bucket name must be less than 63 characters long'
                }
                if (!/^[a-z0-9.-]+$/.test(input)) {
                    return 'Bucket name must be lowercase and contain only letters, numbers, periods, and hyphens'
                }
                return true
            },
        },
        {
            type: 'input',
            name: 'username',
            message: 'Enter the username:',
            validate(input: string | null | undefined) {
                if (!input) {
                    return 'Please enter a username'
                }
                if (input.length < 3) {
                    return 'Username must be at least 3 characters long'
                }
                if (input.length > 63) {
                    return 'Username must be less than 63 characters long'
                }
                if (!/^[a-zA-Z0-9+=,.@_-]+$/.test(input)) {
                    return 'Username must contain only letters, numbers, and the following characters: +=,.@_-'
                }
                return true
            },
        },
        {
            type: 'input',
            name: 'appUrl',
            message: 'Enter the app URL:',
            validate(input: string | null | undefined) {
                if (!input) {
                    return 'Please enter an app URL'
                }
                if (!/^https?:\/\/.+$/.test(input)) {
                    return 'App URL must be a valid URL'
                }
                return true
            },
            default: 'http://localhost:3000',
        },
        {
            type: 'confirm',
            name: 'allowPublicRead',
            message:
                'Would you like to allow public read access? (Public will create 2 folders: public/ and private/)',
        },
        {
            type: 'input',
            name: 'region',
            message: 'Enter the region:',
            default: Bun.env.AWS_DEFAULT_REGION,
        },
        {
            type: 'confirm',
            name: 'defaultPolicy',
            message:
                'Would you like to use the default bucket policy? (PutObject, GetObject)',
        },
    ])

    return response as UserBucketPrompt
}

export const customPolicyNamePrompt = async () => {
    const response = await inquirer.prompt([
        {
            type: 'input',
            name: 'policyName',
            message: 'Enter a unique policy name:',
            validate(input: string | null | undefined) {
                if (!input) {
                    return 'Please enter a policy name'
                }
                if (input.length < 3) {
                    return 'Policy name must be at least 3 characters long'
                }
                if (input.length > 63) {
                    return 'Policy name must be less than 63 characters long'
                }
                if (!/^[a-zA-Z0-9+=,.@_-]+$/.test(input)) {
                    return 'Policy name must contain only letters, numbers, and the following characters: +=,.@_-'
                }
                return true
            },
        },
    ])
    return response as { policyName: string }
}

export const customPolicyPrompt = async () => {
    await inquirer.prompt([
        {
            type: 'input',
            name: 'editor',
            message:
                'A JSON file has been created for you to edit, press enter to open it.',
            validate() {
                openInEditor('custom-bucket-policy.json')
                return true
            },
        },
        {
            type: 'input',
            name: 'policies',
            message:
                'When you are done editing the file, press enter to continue.',
            validate() {
                const file = fs.readFileSync(
                    'custom-bucket-policy.json',
                    'utf-8'
                )

                try {
                    const parsedFile = JSON.parse(file)
                    policySchema.parse(parsedFile)
                } catch (error) {
                    if (error instanceof z.ZodError) {
                        return error.errors.map((err) => err.message).join(', ')
                    }
                    return 'Please enter a valid JSON object'
                }
                return true
            },
        },
    ])
}

export const createBucketFolders = async ({
    bucketName,
    region,
}: {
    bucketName: string
    region?: string
}) => {
    const s3 = createS3Object({ region })
    await s3
        .putObject({
            Bucket: bucketName,
            Key: `public/`,
        })
        .promise()

    await s3
        .putObject({
            Bucket: bucketName,
            Key: `private/`,
        })
        .promise()
}
