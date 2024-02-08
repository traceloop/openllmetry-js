import * as traceloop from "@traceloop/node-server-sdk";
import { CohereClient } from "cohere-ai";

traceloop.initialize({
  appName: "sample_cohere",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY ?? "",
});

// const sampleGenerate = async () => {
//   const response = await cohere.generate({
//     prompt: "What happened to Pluto?",
//     k: 1,
//     temperature: 2,
//   });

//   console.log(response);

//   /**
//    * {
//   id: '660f7aa2-3274-476e-b95f-9716442099b9',
//   generations: [
//     {
//       id: '4608cfdb-7eb6-49b8-becc-cea498e700da',
//       text: ' Pluto is no longer considered to be the ninth planet in our Solar System due to a definition change made by the International Astronomical Union (IAU) in 2006. Instead, it is now classified as a dwarf planet. The IAU introduced new criteria for the definition of a planet, including the following: \n' +
//         '\n' +
//         '- A celestial object must orbit the Sun, \n' +
//         '- It must be spherical in shape due to its own gravitational forces, \n' +
//         '- It must be the dominant body in its orbit, and \n' +
//         '- It should have "cleared the neighborhood" around its orbit, meaning that it is essentially alone in its orbital path without any significant debris or asteroid influence. \n' +
//         '\n' +
//         'Pluto was found not to meet these new criteria and was therefore reclassified as a dwarf planet. There are currently five recognized dwarf planets in our Solar System, including Pluto. ',
//       finish_reason: 'COMPLETE'
//     }
//   ],
//   prompt: 'What happened to Pluto?',
//   meta: {
//     apiVersion: { version: '1' },
//     billedUnits: { inputTokens: 5, outputTokens: 174 }
//   }
// }
//    * */
// };

/* const sampleGenerateStream = async () => {
  const streamedResponse = await cohere.generateStream({
    prompt: "What happened to Pluto?",
    k: 1,
    temperature: 2,
  });

  for await (const message of streamedResponse) {
    if (message.eventType === "text-generation") {
      // { eventType: 'text-generation', text: ' Pluto', isFinished: false }
      console.log(message.text);
    }
  }
}; */

// const sampleChat = async () => {
//   const chatResponse = await cohere.chat({
//     chatHistory: [
//       { role: "USER", message: "Who discovered gravity?" },
//       {
//         role: "CHATBOT",
//         message:
//           "The man who is widely credited with discovering gravity is Sir Isaac Newton",
//       },
//     ],
//     message: "What year was he born?",
//     // perform web search before answering the question. You can also use your own custom connector.
//     connectors: [{ id: "web-search" }],
//   });

//   console.log(chatResponse);

//   /*   {
//       response_id: 'd0c494eb-c91d-4fdb-b977-2d4ca32a247b',
//       text: 'Isaac Newton was born on December 25 1642 (4 January 1643 New Style), or possibly 4 January 1643 (December 25 1642 Old Style). This date was recorded according to the Julian calendar, which was used in England at the time of his birth.',
//       generationId: 'a6790d37-f762-4510-92bb-7d304431e4a8',
//       token_count: {
//         prompt_tokens: 1376,
//         response_tokens: 54,
//         total_tokens: 1430,
//         billed_tokens: 77
//       },
//       meta: {
//         api_version: { version: '1' },
//         billed_units: { input_tokens: 23, output_tokens: 54 }
//       },
//       citations: [
//         {
//           start: 25,
//           end: 41,
//           text: 'December 25 1642',
//           documentIds: [Array]
//         },
//         {
//           start: 42,
//           end: 68,
//           text: '(4 January 1643 New Style)',
//           documentIds: [Array]
//         },
//         {
//           start: 82,
//           end: 96,
//           text: '4 January 1643',
//           documentIds: [Array]
//         },
//         {
//           start: 97,
//           end: 125,
//           text: '(December 25 1642 Old Style)',
//           documentIds: [Array]
//         },
//         {
//           start: 167,
//           end: 182,
//           text: 'Julian calendar',
//           documentIds: [Array]
//         }
//       ],
//       documents: [
//         {
//           id: 'web-search_5:3',
//           snippet: '\n' +
//             '\n' +
//             "Isaac Newton was born 25 December 1642 Old Style (4 January 1643 on the Gregorian calendar, which is now used) at Woolsthorpe Manor in Woolsthorpe-by-Colsterworth, a hamlet in the county of Lincolnshire. (At the time of Newton's birth, England had not adopted the Gregorian calendar and therefore his date of birth was recorded as 25 December, according to the Julian calendar.)\n" +
//             '\n' +
//             'Newton was born two months after the death of his father, a prosperous farmer also named Isaac Newton. His father was described as a "wealthy and uneducated man". Born prematurely, young Isaac was a small child; his mother Hannah Ayscough reportedly said that he could have fit inside a quart mug.',
//           title: 'Early life of Isaac Newton - Wikipedia',
//           url: 'https://en.wikipedia.org/wiki/Early_life_of_Isaac_Newton'
//         },
//         {
//           id: 'web-search_7:1',
//           snippet: ' Three centuries later the resulting structure - classical mechanics - continues to be a useful but no less elegant monument to his genius.\n' +
//             '\n' +
//             "- Isaac Newton was born prematurely on Christmas day 1642 (4 January 1643, New Style) in Woolsthorpe, a hamlet near Grantham in Lincolnshire. The posthumous son of an illiterate yeoman (also named Isaac), the fatherless infant was small enough at birth to fit 'into a quartpot.' When he was barely three years old Newton's mother, Hanna (Ayscough), placed her first born with his grandmother in order to remarry and raise a second family with Barnabas Smith, a wealthy rector from nearby North Witham.",
//           title: "Isaac Newton Biography - Newton's Life, Career, Work - Dr Robert A. Hatch",
//           url: 'https://users.clas.ufl.edu/ufhatch/pages/01-courses/current-courses/08sr-newton.htm'
//         },
//         {
//           id: 'web-search_2:1',
//           snippet: ' In 1705, he was knighted by Queen Anne of England, making him Sir Isaac Newton.\n' +
//             '\n' +
//             'Early Life and Family\n' +
//             '\n' +
//             `Newton was born on January 4, 1643, in Woolsthorpe, Lincolnshire, England. Using the "old" Julian calendar, Newton's birth date is sometimes displayed as December 25, 1642.\n` +
//             '\n' +
//             'Newton was the only son of a prosperous local farmer, also named Isaac, who died three months before he was born. A premature baby born tiny and weak, Newton was not expected to survive.\n' +
//             '\n' +
//             'When he was 3 years old, his mother, Hannah Ayscough Newton, remarried a well-to-do minister, Barnabas Smith, and went to live with him, leaving young Newton with his maternal grandmother.',
//           title: 'Isaac Newton - Quotes, Facts & Laws',
//           url: 'https://www.biography.com/scientists/isaac-newton'
//         },
//         {
//           id: 'web-search_4:69',
//           snippet: " At Newton's birth, Gregorian dates were ten days ahead of Julian dates; thus, his birth is recorded as taking place on 25 December 1642 Old Style, but it can be converted to a New Style (modern) date of 4 January 1643. By the time of his death, the difference between the calendars had increased to eleven days. Moreover, he died in the period after the start of the New Style year on 1 January but before that of the Old Style new year on 25 March. His death occurred on 20 March 1726, according to the Old Style calendar, but the year is usually adjusted to 1727. A full conversion to New Style gives the date 31 March 1727.\n" +
//             '\n' +
//             '^ This claim was made by William Stukeley in 1727, in a letter about Newton written to Richard Mead.',
//           title: 'Isaac Newton - Wikipedia',
//           url: 'https://en.wikipedia.org/wiki/Isaac_Newton'
//         },
//         {
//           id: 'web-search_8:1',
//           snippet: ' Early Life Isaac Newton was born in Woolsthorpe, England on January 4, 1643. His father, a farmer who was also named Isaac Newton, had died three months before his birth. His mother remarried when Isaac was three years old and left young Isaac in the care of his grandparents. Isaac attended school where he was an adequate student. At one point his mother tried to take him out of school so he could help on the farm, but Isaac had no interest in becoming a farmer and was soon back at school. Isaac grew up mostly alone. For the rest of his life he would prefer to work and live alone focused on his writing and his studies.',
//           title: 'Biography for Kids: Scientist - Isaac Newton',
//           url: 'https://www.ducksters.com/biography/scientists/isaac_newton.php'
//         }
//       ],
//       searchResults: [
//         {
//           searchQuery: [Object],
//           documentIds: [Array],
//           connector: [Object]
//         }
//       ],
//       tool_inputs: null,
//       searchQueries: [
//         {
//           text: 'Isaac Newton birth year',
//           generationId: '98746c6c-6bdd-42eb-9a25-d3c5010a91a0'
//         }
//       ]
//     } */
// };

// const sampleChatStream = async () => {
//   const chatStream = await cohere.chatStream({
//     chatHistory: [
//       { role: "USER", message: "Who discovered gravity?" },
//       {
//         role: "CHATBOT",
//         message:
//           "The man who is widely credited with discovering gravity is Sir Isaac Newton",
//       },
//     ],
//     message: "What year was he born?",
//     // perform web search before answering the question. You can also use your own custom connector.
//     connectors: [{ id: "web-search" }],
//   });

//   for await (const message of chatStream) {
//     if (message.eventType === "text-generation") {
//       // { eventType: 'text-generation', is_finished: false, text: 'Isaac' }
//       console.log(message);
//     }
//   }
// };

const sampleRerank = async () => {
  return await traceloop.withWorkflow("sample_rerank", {}, async () => {
    const rerank = await cohere.rerank({
      documents: [
        {
          text: "Carson City is the capital city of the American state of Nevada.",
        },
        {
          text: "The Commonwealth of the Northern Mariana Islands is a group of islands in the Pacific Ocean. Its capital is Saipan.",
        },
        {
          text: "Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district.",
        },
        {
          text: "Capital punishment (the death penalty) has existed in the United States since beforethe United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states.",
        },
      ],
      query: "What is the capital of the United States?",
      topN: 3,
    });

    console.log(rerank);

    /*   {
    id: '05e9ed9a-17e5-4b7b-91b6-b472aea136ed',
    results: [
      { index: 2, relevanceScore: 0.98005307 },
      { index: 3, relevanceScore: 0.27904198 },
      { index: 0, relevanceScore: 0.10194652 }
    ],
    meta: { apiVersion: { version: '1' }, billedUnits: { searchUnits: 1 } }
  } */
  });
};

traceloop.withAssociationProperties({}, async () => {
  await sampleRerank();
});
