import {
    attachPublicBucketPolicy,
    attachUserPolicy,
    createS3Bucket,
    createAccessKey,
    userBucketPrompt,
    getDefaultUserPolicy,
    createUser,
    attachBucketCors,
    customPolicyPrompt,
    createPolicy,
    customPolicyNamePrompt,
} from './utils'
import fs from 'fs'
;(async () => {
    const {
        bucketName,
        defaultPolicy,
        region,
        username,
        allowPublicRead,
        appUrl,
    } = await userBucketPrompt()

    let policyName: string | undefined = undefined

    if (!defaultPolicy) {
        const { policyName: name } = await customPolicyNamePrompt()
        fs.writeFileSync(
            'custom-bucket-policy.json',
            JSON.stringify(
                {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Action: [],
                            Resource: [`arn:aws:s3:::${bucketName}/*`],
                        },
                    ],
                },
                null,
                4
            )
        )
        await customPolicyPrompt()
        policyName = name
    }

    console.log('Creating S3 bucket...')
    await createS3Bucket({ bucketName, region })
    console.log(`Bucket ${bucketName} created!`)

    console.log('\n-----------------------------------\n')

    console.log('Attaching CORS policy to bucket...')
    await attachBucketCors({
        bucketName,
        region,
        corsConfiguration: [
            {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'DELETE'],
                AllowedOrigins: [appUrl],
                ExposeHeaders: [],
                MaxAgeSeconds: 3000,
            },
        ],
    })
    console.log('CORS policy attached!')

    console.log('\n-----------------------------------\n')

    if (allowPublicRead) {
        console.log('Creating public bucket policy...')
        await attachPublicBucketPolicy({
            bucketName,
            region,
        })
        console.log('Public bucket policy created!')
    }

    console.log('\n-----------------------------------\n')
    console.log('Creating IAM user...')
    await createUser({ username, region })
    console.log('IAM user created!')

    if (defaultPolicy) {
        console.log('Attaching default policy to user...')
        const arn = await getDefaultUserPolicy({
            bucketName,
            region,
        })
        await attachUserPolicy({
            username,
            policyArn: arn,
            region,
        })
        console.log('Default policy attached!')
    } else {
        console.log('Creating custom policy...')
        if (!policyName) throw new Error('Policy name not found')

        const policyDocument = fs.readFileSync('custom-bucket-policy.json', {
            encoding: 'utf-8',
        })
        await createPolicy({
            policyName,
            policyDocument: JSON.stringify(JSON.parse(policyDocument)),
            region,
        })
        await attachUserPolicy({
            username,
            policyArn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:policy/${policyName}`,
            region,
        })
    }

    console.log('\n-----------------------------------\n')
    console.log('Creating access key...')
    const { AccessKeyId, SecretAccessKey } = await createAccessKey({
        username,
        region,
    })

    console.log('Access key created!')
    console.log('\n-----------------------------------\n')

    console.log('Creating .env file...')
    const env = `AWS_ACCESS_KEY_ID=${AccessKeyId}\nAWS_SECRET_ACCESS_KEY=${SecretAccessKey}\nAWS_BUCKET_NAME=${bucketName}\nAWS_REGION=${region}`
    fs.writeFileSync(`.env.${bucketName}`, env)

    console.log('All done!')
})()
