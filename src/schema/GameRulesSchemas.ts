import z from "zod";

export const gameRulesIdSchema = z.number().int("Game Rules ID must be an integer");
export const gameRulesIdParamSchema = z.coerce.number().int("Game Rules ID must be an integer");

export const gameRulesGetByIdSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema
    })
});

// Validate that uma array sums to 0
const validateUmaSum = (uma: number[]): boolean => {
    const sum = uma.reduce((acc, val) => acc + val, 0);
    return Math.abs(sum) < 0.001; // Allow small floating point errors
};

// Simple uma (1D array) validation
const simpleUmaSchema = z.array(z.number()).refine(
    (uma) => validateUmaSum(uma),
    { message: "Uma values must sum to 0" }
);

// Dynamic uma (2D array) validation
const dynamicUmaSchema = z.array(z.array(z.number())).refine(
    (uma) => {
        // Each row must sum to 0
        return uma.every(row => validateUmaSum(row));
    },
    { message: "Each uma row must sum to 0" }
);

// Uma can be either simple or dynamic
const umaSchema = z.union([simpleUmaSchema, dynamicUmaSchema]);

export const gameRulesCreateSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
        numberOfPlayers: z.number().int("numberOfPlayers must be an integer").min(3).max(4, "numberOfPlayers must be 3 or 4"),
        uma: umaSchema,
        startingPoints: z.number().int("startingPoints must be an integer").positive("startingPoints must be positive"),
        startingRating: z.number().positive("startingRating must be positive")
    }).refine(
        (data) => {
            // Validate uma length matches numberOfPlayers
            if (Array.isArray(data.uma[0])) {
                // Dynamic uma - 2D array
                const dynamicUma = data.uma as number[][];
                // Outer array length should equal numberOfPlayers
                if (dynamicUma.length !== data.numberOfPlayers) {
                    return false;
                }
                // Each inner array length should equal numberOfPlayers
                return dynamicUma.every(row => row.length === data.numberOfPlayers);
            } else {
                // Simple uma - 1D array
                return (data.uma as number[]).length === data.numberOfPlayers;
            }
        },
        { message: "Uma array dimensions must match numberOfPlayers", path: ["uma"] }
    )
});

export const gameRulesUpdateSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema
    }),
    body: z.object({
        name: z.string().min(1, "Name cannot be empty").max(100, "Name must be 100 characters or less").optional(),
        numberOfPlayers: z.number().int("numberOfPlayers must be an integer").min(3).max(4, "numberOfPlayers must be 3 or 4").optional(),
        uma: umaSchema.optional(),
        startingPoints: z.number().int("startingPoints must be an integer").positive("startingPoints must be positive").optional(),
        startingRating: z.number().positive("startingRating must be positive").optional()
    }).refine(
        (data) => {
            // If both numberOfPlayers and uma are provided, validate they match
            if (data.numberOfPlayers && data.uma) {
                if (Array.isArray(data.uma[0])) {
                    const dynamicUma = data.uma as number[][];
                    if (dynamicUma.length !== data.numberOfPlayers) {
                        return false;
                    }
                    return dynamicUma.every(row => row.length === data.numberOfPlayers);
                } else {
                    return (data.uma as number[]).length === data.numberOfPlayers;
                }
            }
            return true;
        },
        { message: "Uma array dimensions must match numberOfPlayers", path: ["uma"] }
    )
});

export const gameRulesDeleteSchema = z.object({
    params: z.object({
        id: gameRulesIdParamSchema
    })
});
