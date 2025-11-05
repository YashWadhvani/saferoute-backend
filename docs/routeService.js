// routeService.js - Core GeoHash Aggregation Logic

/**
 * @function Calculate_Route_Score
 * Calculates the final S_Route score (0-10 scale) for candidate paths.
 */
async function Calculate_Route_Score(origin, destination) {

    // 1. Route Retrieval: Fetches multiple candidate polylines from Mapping API
    const candidateRoutes = await fetchMappingRoutes(origin, destination, 3);

    for (const route of candidateRoutes) {
        // 2. Path Discretization via GeoHash
        // Breaks the continuous polyline into discrete GeoHash IDs (Precision 7)
        const geoHashes = Discretize_Polyline(route.geometry, 7);

        let totalRawScore = 0;
        let N = 0; // Count of GeoHash cells scored

        for (const hashId of geoHashes) {
            // 3. Safety Score Lookup (MongoDB)
            // Queries safetyscores collection for the pre-calculated S_raw (0-10)
            const S_raw = await Lookup_MongoDB_Score(hashId); 
            
            totalRawScore += S_raw;
            N += 1;
        }
        
        // 4. Route Score Aggregation (Arithmetic Mean)
        // S_Route = (Sum of S_raw) / N
        route.S_Route = (totalRawScore / N).toFixed(2);
    }
    
    // 5. Final Ranking: Flags routes as Safest, Fastest, Optimized based on S_Route and Duration
    return Rank_Routes_For_Display(candidateRoutes);
}