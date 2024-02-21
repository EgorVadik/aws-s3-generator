import { z } from 'zod'

export type UserBucketPrompt = {
    bucketName: string
    username: string
    allowPublicRead: boolean
    region?: string
    defaultPolicy: boolean
    appUrl: string
}

// export type Policy = {
//     Version: '2012-10-17'
//     Statement: [
//         {
//             Effect: string
//             Action: string[]
//             Resource: [`arn:aws:s3:::${string}/${string}`]
//         }
//     ]
// }

export const policySchema = z.object({
    Version: z.literal('2012-10-17'),
    Statement: z.array(
        z.object({
            Effect: z.string(),
            Action: z.array(z.string()).min(1, {
                message: 'Policy must have at least one action',
            }),
            Resource: z.array(z.string()).min(1, {
                message: 'Policy must have at least one resource',
            }),
        })
    ),
})

export type PolicyDocument = z.infer<typeof policySchema>
