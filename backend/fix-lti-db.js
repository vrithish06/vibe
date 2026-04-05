import { MongoClient } from 'mongodb';
async function main() {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('lti_db'); // Use LTI database
        const collection = db.collection('browniepoints');
        const result = await collection.updateMany({ "history.awardedBy": "Student" }, { $set: { "history.$[elem].awardedBy": "Venkata Rithish" } }, { arrayFilters: [{ "elem.awardedBy": "Student" }] });
        console.log(`Updated ${result.modifiedCount} documents.`);
    }
    finally {
        await client.close();
    }
}
main().catch(console.dir);
