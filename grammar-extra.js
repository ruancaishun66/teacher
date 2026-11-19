/* 语法专题库：在 60 天打卡之外，按两本语法书的高频考点整理的进阶内容。
   只作为查阅与加练，不参与每日任务判定；页面用折叠面板收纳，避免打卡页过杂。 */
(function () {
  'use strict';

  const topics = [
    {
      id: 'tense-contrast',
      title: '一般过去 vs 现在完成：时间点与时间跨度',
      level: '进阶',
      tag: '时态',
      minutes: 6,
      intro: '两个时态都讲“过去”，但一个只交代过去发生的事，另一个把过去和现在连起来。先看时间词，再看句子想强调什么。',
      points: [
        {
          h: '看时间词，快速分流',
          body: 'yesterday、last week、in 2020、just now 这类“明确过去时间点”用一般过去时；for、since、already、yet、ever、never、so far 常和现在完成时搭配。',
          eg: [
            ['I saw the film last night.', '我昨晚看了那部电影。'],
            ['I have seen the film twice.', '那部电影我已经看过两遍。']
          ]
        },
        {
          h: '现在完成强调“现在的结果”',
          body: '说话人真正关心的是过去动作对现在造成的影响，而不是动作发生的具体时间。所以不能和 yesterday 这类具体过去时间连用。',
          eg: [
            ['She has lost her key, so she cannot open the door.', '她把钥匙丢了，所以现在开不了门。'],
            ['She lost her key yesterday.', '她昨天丢了钥匙。']
          ]
        },
        {
          h: '瞬间动词要换成延续性表达',
          body: 'buy、borrow、die、leave、join 等瞬间动词不能直接和 for/since 连用，要换成 have had、have kept、have been dead、have been away、have been in 等。',
          eg: [
            ['He has been in the club for two years.', '他加入俱乐部两年了。'],
            ['His grandfather has been dead for five years.', '他爷爷去世五年了。']
          ]
        }
      ],
      pitfall: '不要写 “I have seen him yesterday.”。有明确过去时间就用一般过去时：I saw him yesterday.',
      drills: [
        {
          q: 'We ___ each other since we were children.',
          options: ['met', 'have known', 'knew', 'have met'],
          answer: 1,
          explain: 'since 引导的时间状语要求主句用现在完成时；know 是延续性动词，所以用 have known。'
        },
        {
          q: 'She ___ her homework already, so she can watch TV now.',
          options: ['finished', 'has finished', 'finishes', 'was finishing'],
          answer: 1,
          explain: 'already 表示“到现在为止已经完成”，强调对现在的影响，用现在完成时 has finished。'
        }
      ]
    },
    {
      id: 'passive-advanced',
      title: '被动语态进阶：感官、使役与短语动词',
      level: '进阶',
      tag: '语态',
      minutes: 6,
      intro: '基础被动是 be + 过去分词；真正容易错的是“谁被要求做什么”“短语动词的介词不能丢”以及“有些动词根本没有被动”。',
      points: [
        {
          h: '感官、使役动词要补 to',
          body: '主动语态里 make/let/have sb do、see/hear/watch sb do 省略 to；变成被动后，to 要还原。see/hear sb doing 变被动则用 doing。',
          eg: [
            ['The boy was made to apologize.', '那个男孩被迫道歉。'],
            ['She was heard singing in the next room.', '有人听见她在隔壁唱歌。']
          ]
        },
        {
          h: '短语动词的介词要保留',
          body: 'look after、take care of、pay attention to、put off 等短语动词变被动时，后面的介词不能丢。',
          eg: [
            ['The baby is looked after by her grandma.', '这个婴儿由奶奶照顾。'],
            ['The meeting has been put off.', '会议已经被推迟了。']
          ]
        },
        {
          h: '不及物动词没有被动',
          body: 'happen、appear、belong to、consist of、rise、arrive 等不及物动词（或短语）不能直接变被动，需要用主动形式表达。',
          eg: [
            ['The accident happened at midnight.', '事故发生在午夜。'],
            ['The book belongs to the school library.', '这本书属于学校图书馆。']
          ]
        }
      ],
      pitfall: '“The baby was looked after well” 里的 after 不能省；“The accident was happened” 是典型错句。',
      drills: [
        {
          q: 'The children ___ by the teacher to read aloud.',
          options: ['made', 'were made', 'have made', 'are making'],
          answer: 1,
          explain: 'make sb do 变被动为 be made to do；children 是动作承受者，所以用 were made。'
        },
        {
          q: 'The old man ___ by his neighbors every day.',
          options: ['looks after', 'is looked after', 'is looking after', 'has looked after'],
          answer: 1,
          explain: 'look after 是短语动词，变被动时介词 after 要保留：is looked after。'
        }
      ]
    },
    {
      id: 'relative-clause',
      title: '定语从句：关系词怎么选，什么时候只能用 that',
      level: '进阶',
      tag: '从句',
      minutes: 7,
      intro: '选关系词只做两件事：看先行词指人还是指物，再看关系词在从句里充当什么成分。',
      points: [
        {
          h: '先看先行词，再看成分',
          body: '指人用 who/whom/whose，指物用 which/whose；关系词在从句中作主语、宾语、定语。where/when/why 分别代替地点、时间、原因状语。',
          eg: [
            ['The girl who sits next to me is from Yunnan.', '坐我旁边的女孩来自云南。'],
            ['This is the village where I grew up.', '这就是我长大的村子。']
          ]
        },
        {
          h: '这些情况通常只用 that',
          body: '先行词是 all、anything、everything、nothing 等不定代词；先行词被序数词、最高级、the only、the very 修饰；先行词同时有人和物时，通常用 that。',
          eg: [
            ['This is the best film that I have ever seen.', '这是我看过的最好的电影。'],
            ['Everything that he said was true.', '他说的一切都是真的。']
          ]
        },
        {
          h: '介词 + which/whom 不能再用 that',
          body: '介词提前时，指物用 which，指人用 whom；介词的选择看从句里的动词搭配或先行词的习惯搭配。',
          eg: [
            ['The house in which he lives is very old.', '他住的那所房子很旧。'],
            ['The person to whom I spoke was very kind.', '和我说话的那个人很友善。']
          ]
        }
      ],
      pitfall: '“This is the house where I lived in.” 是错句：where 已经代替地点状语，后面不能再加 in；要么用 where I lived，要么用 which I lived in。',
      drills: [
        {
          q: 'This is the house ___ I lived in last year.',
          options: ['where', 'which', 'when', 'whose'],
          answer: 1,
          explain: '从句里 lived in 缺宾语，先行词是物，所以用 which；in 已经放在句末，不能再选 where。'
        },
        {
          q: 'The reason ___ he was late was not clear.',
          options: ['why', 'which', 'whose', 'where'],
          answer: 0,
          explain: '先行词是 reason，从句缺少原因状语，用 why（= for which）。'
        }
      ]
    },
    {
      id: 'noun-clause',
      title: '名词性从句：that 和 what 的分工',
      level: '进阶',
      tag: '从句',
      minutes: 7,
      intro: '名词性从句可以作主语、宾语、表语、同位语。最容易混的是 that 和 what：一个只起连接作用，一个必须在从句里当成分。',
      points: [
        {
          h: 'that 不作成分，what 必须作成分',
          body: 'that 引导名词性从句时没有词义，也不作句子成分；what 相当于“the thing(s) that”，在从句中作主语、宾语或表语。',
          eg: [
            ['That he passed the exam made us happy.', '他通过考试让我们很高兴。'],
            ['What he said made us happy.', '他说的话让我们很高兴。']
          ]
        },
        {
          h: 'whether 和 if 不完全一样',
          body: '介词后、句首主语、与 or not 连用时，通常用 whether；if 更常用于宾语从句。',
          eg: [
            ['Whether he will come or not is still unknown.', '他是否会来仍然未知。'],
            ['I wonder whether/if he is at home.', '我想知道他是否在家。']
          ]
        },
        {
          h: '从句一律用陈述语序',
          body: '无论主句是不是疑问句，名词性从句内部都用“主语 + 谓语”的陈述语序。',
          eg: [
            ['I don’t know where he is.', '我不知道他在哪里。'],
            ['Can you tell me when the train leaves?', '你能告诉我火车什么时候出发吗？']
          ]
        }
      ],
      pitfall: '“I don’t know where is he.” 是错句；从句里要把 is 放回 he 后面：where he is。',
      drills: [
        {
          q: '___ he said at the meeting surprised everyone.',
          options: ['That', 'What', 'Which', 'It'],
          answer: 1,
          explain: 'said 后面缺宾语，需要一个既能连接又能作宾语的词，用 what。'
        },
        {
          q: 'I am not sure ___ he will come or not.',
          options: ['if', 'whether', 'that', 'what'],
          answer: 1,
          explain: '与 or not 直接连用时，通常用 whether，不用 if。'
        }
      ]
    },
    {
      id: 'adverbial-clause',
      title: '状语从句：条件与让步的两条铁律',
      level: '进阶',
      tag: '从句',
      minutes: 5,
      intro: '条件句和让步句是考试高频。记住“主将从现”和“关联词不重复”，大部分题就能做对。',
      points: [
        {
          h: '主将从现',
          body: 'if、unless、when、as soon as 等引导时间/条件状语从句时，如果主句用一般将来时，从句用一般现在时表示将来。',
          eg: [
            ['If it rains tomorrow, we will stay at home.', '如果明天下雨，我们就待在家里。'],
            ['I will call you as soon as I arrive.', '我一到就给你打电话。']
          ]
        },
        {
          h: 'although 和 but 不能同时出现',
          body: '汉语说“虽然……但是……”，英语里 although/though 和 but 只能留一个；because 和 so 也一样。',
          eg: [
            ['Although he was tired, he kept working.', '虽然他很累，但他继续工作。'],
            ['He was tired, but he kept working.', '他很累，但他继续工作。']
          ]
        },
        {
          h: 'unless = if not',
          body: 'unless 表示“除非；如果不”，本身已经含否定意义，后面不要再加 not。',
          eg: [
            ['You will fail unless you work harder.', '除非你更努力，否则你会失败。'],
            ['You will fail if you don’t work harder.', '如果你不更努力，你就会失败。']
          ]
        }
      ],
      pitfall: '“Although he was tired, but he kept working.” 是错句，although 和 but 删掉其中一个。',
      drills: [
        {
          q: '___ he was tired, he kept working.',
          options: ['Although', 'But', 'Because', 'So'],
          answer: 0,
          explain: '前后是让步关系；although 引导让步状语从句，后面不能再加 but。'
        },
        {
          q: 'You won’t pass the exam ___ you work harder.',
          options: ['if', 'unless', 'because', 'although'],
          answer: 1,
          explain: 'unless 表示“除非”，相当于 if you don’t work harder。'
        }
      ]
    },
    {
      id: 'nonfinite',
      title: '非谓语动词：to do、doing、done 怎么选',
      level: '冲刺',
      tag: '非谓语',
      minutes: 8,
      intro: '一个句子里已经有了谓语，其他动词就要变成非谓语。选 to do、doing 还是 done，关键看它和逻辑主语的关系，以及固定搭配。',
      points: [
        {
          h: 'to do 表目的、将来；doing 表主动、进行；done 表被动、完成',
          body: '先找非谓语的逻辑主语，再判断是主动还是被动、动作是否发生。目的状语通常用 to do。',
          eg: [
            ['He got up early to catch the first bus.', '他早起是为了赶首班车。'],
            ['Seen from the hill, the city looks beautiful.', '从山上看，这座城市很美。']
          ]
        },
        {
          h: '固定搭配要成组记',
          body: 'decide/plan/hope/want/refuse + to do；enjoy/finish/mind/practice/suggest + doing；look forward to、be used to、pay attention to 里的 to 是介词，后面接 doing。',
          eg: [
            ['She is looking forward to hearing from you.', '她期待收到你的来信。'],
            ['He practices speaking English every day.', '他每天练习说英语。']
          ]
        },
        {
          h: '作状语时逻辑主语要一致',
          body: '非谓语作状语时，它的逻辑主语通常就是主句主语。主动关系用 doing，被动关系用 done，不能用“主语不一致”的分词短语。',
          eg: [
            ['Walking along the street, I met an old friend.', '沿街走时，我遇到了一位老朋友。'],
            ['Given more time, we could do it better.', '如果多给些时间，我们能做得更好。']
          ]
        }
      ],
      pitfall: '“Looking forward to hear from you” 错在 to 是介词，应改为 hearing。',
      drills: [
        {
          q: 'He kept ___ English aloud every morning.',
          options: ['to read', 'reading', 'read', 'reads'],
          answer: 1,
          explain: 'keep doing sth 表示“持续做某事”，所以用 reading。'
        },
        {
          q: '___ from the top of the hill, the city looks beautiful.',
          options: ['Seeing', 'Seen', 'To see', 'See'],
          answer: 1,
          explain: '城市是“被看”，逻辑主语 the city 与 see 是被动关系，用过去分词 Seen。'
        }
      ]
    },
    {
      id: 'subjunctive',
      title: '虚拟语气：与现在、过去、将来相反',
      level: '冲刺',
      tag: '语气',
      minutes: 8,
      intro: '虚拟语气用来表达“与现实相反”或“不太可能实现”的假设。先判断假设的是现在、过去还是将来，再套公式。',
      points: [
        {
          h: '与现在事实相反',
          body: 'If + 主语 + 一般过去时（be 用 were），主句用 would/could/might + 动词原形。',
          eg: [
            ['If I were you, I would apologize.', '如果我是你，我会道歉。'],
            ['If he had more time, he could travel more.', '如果他有更多时间，他就能多去旅行。']
          ]
        },
        {
          h: '与过去事实相反',
          body: 'If + 主语 + had done，主句用 would/could/might + have done。',
          eg: [
            ['If he had left earlier, he would have caught the train.', '如果他早点出发，就赶上火车了。'],
            ['If I had known, I would have told you.', '如果我当时知道，就告诉你了。']
          ]
        },
        {
          h: 'wish 与 suggest 的虚拟',
          body: 'wish 后与现在相反用过去时，与过去相反用 had done；suggest/insist/demand/require 表示“建议、坚持、要求”时，从句用 (should) + 动词原形。',
          eg: [
            ['I wish I knew the answer.', '真希望我知道答案。'],
            ['The teacher suggested that we (should) read more.', '老师建议我们多阅读。']
          ]
        }
      ],
      pitfall: '虚拟条件句里 be 动词通常用 were，不用 was；但口语中 if I was 也能听到，考试优先写 were。',
      drills: [
        {
          q: 'If I ___ you, I would apologize to her.',
          options: ['am', 'was', 'were', 'be'],
          answer: 2,
          explain: '与现在事实相反，if 从句的 be 动词用 were。'
        },
        {
          q: 'If he had left earlier, he ___ the train.',
          options: ['caught', 'would catch', 'would have caught', 'had caught'],
          answer: 2,
          explain: '与过去事实相反，主句用 would have + 过去分词。'
        }
      ]
    },
    {
      id: 'inversion',
      title: '倒装：否定词提前与 only 倒装',
      level: '冲刺',
      tag: '句法',
      minutes: 7,
      intro: '倒装不是把整句打乱，而是把助动词、情态动词或 be 动词提到主语前面。否定词和 only 位于句首时最常见。',
      points: [
        {
          h: '否定词放句首，用部分倒装',
          body: 'Never、Seldom、Hardly、No sooner、Not until、Not only 等位于句首时，主句要部分倒装：助动词/情态动词 + 主语 + 动词。',
          eg: [
            ['Never have I seen such a beautiful sunrise.', '我从未见过这么美的日出。'],
            ['Not until midnight did he finish the work.', '直到午夜他才完成工作。']
          ]
        },
        {
          h: 'only + 状语放句首',
          body: 'only 修饰状语（then、after...、when...）并放在句首时，主句倒装；only 修饰主语时不倒装。',
          eg: [
            ['Only then did I realize my mistake.', '直到那时我才意识到错误。'],
            ['Only he knows the truth.', '只有他知道真相。']
          ]
        },
        {
          h: 'so/neither 表示“也一样”',
          body: '肯定附和用 So + 助动词 + 主语；否定附和用 Neither/Nor + 助动词 + 主语。时态和助动词要与前句一致。',
          eg: [
            ['She likes tea. So do I.', '她喜欢茶，我也是。'],
            ['He didn’t come. Neither did she.', '他没来，她也没来。']
          ]
        }
      ],
      pitfall: '“Never I have seen...” 是错句；否定词提前后要写成 Never have I seen...。',
      drills: [
        {
          q: 'Never ___ such a wonderful performance.',
          options: ['I have seen', 'have I seen', 'I saw', 'did I saw'],
          answer: 1,
          explain: 'Never 位于句首，主句用部分倒装：have + I + seen。'
        },
        {
          q: 'Only after the exam ___ how much he had missed.',
          options: ['he realized', 'did he realize', 'he did realize', 'realized he'],
          answer: 1,
          explain: 'Only + 时间状语 after the exam 位于句首，主句用部分倒装 did he realize。'
        }
      ]
    },
    {
      id: 'cleft',
      title: '强调句：It is/was ... that ...',
      level: '进阶',
      tag: '句法',
      minutes: 6,
      intro: '强调句把要突出的信息放到 It is/was 和 that 之间。判断方法：去掉强调框架，句子仍然完整。',
      points: [
        {
          h: '基本结构',
          body: 'It is/was + 被强调部分 + that/who + 其余部分。强调人时可用 who，强调其他成分通常用 that。',
          eg: [
            ['It was Tom that/who broke the window.', '打破窗户的是汤姆。'],
            ['It was in the library that I met her.', '我是在图书馆遇见她的。']
          ]
        },
        {
          h: 'not until 的强调',
          body: '强调 not until 时，把 not until 整个放到 It was 后面，that 后面用肯定语序。',
          eg: [
            ['It was not until midnight that he finished.', '直到午夜他才完成。'],
            ['It was not until I read the book that I understood.', '直到读了那本书我才明白。']
          ]
        },
        {
          h: '强调句 vs 定语从句',
          body: '去掉 It is/was ... that 后，句子仍然完整的是强调句；如果缺成分，可能是定语从句或主语从句。',
          eg: [
            ['It is the book that I bought yesterday.', '这就是我昨天买的那本书。（强调句）'],
            ['It is a book that tells a true story.', '这是一本讲真实故事的书。（定语从句）']
          ]
        }
      ],
      pitfall: '强调句中的 that 不能换成 where/when，即使被强调的是地点或时间：It was in the park that we met.',
      drills: [
        {
          q: 'It was in the library ___ I met her.',
          options: ['where', 'that', 'which', 'when'],
          answer: 1,
          explain: '这是强调句，强调地点状语 in the library，框架词用 that。'
        },
        {
          q: 'It was not until midnight ___ he finished the work.',
          options: ['when', 'that', 'which', 'where'],
          answer: 1,
          explain: 'not until 的强调句固定用 It was not until ... that ...。'
        }
      ]
    },
    {
      id: 'agreement',
      title: '主谓一致：就近、就远与集合名词',
      level: '进阶',
      tag: '句法',
      minutes: 6,
      intro: '主语里有 and、or、with、together with 时，谓语到底跟谁走？记住三组规则就能避开大多数陷阱。',
      points: [
        {
          h: '就近原则',
          body: 'either...or、neither...nor、not only...but also、there be 句型，谓语通常与最近的主语保持一致。',
          eg: [
            ['Neither Tom nor his friends are ready.', '汤姆和他的朋友们都没准备好。'],
            ['There is a pen and two books on the desk.', '桌上有一支笔和两本书。']
          ]
        },
        {
          h: '就远原则',
          body: '主语后面跟 with、together with、along with、as well as、besides 时，谓语与前面的主语一致，不受这些短语影响。',
          eg: [
            ['The teacher, together with the students, is visiting the museum.', '老师和学生们正在参观博物馆。'],
            ['Tom as well as his parents likes music.', '汤姆和他的父母都喜欢音乐。']
          ]
        },
        {
          h: '集合名词与数量表达',
          body: 'family/class/team 看作整体时用单数，强调成员时用复数；the number of + 复数名词作主语，谓语用单数；a number of + 复数名词作主语，谓语用复数。',
          eg: [
            ['The number of students is increasing.', '学生人数在增加。'],
            ['A number of students are playing outside.', '许多学生正在外面玩。']
          ]
        }
      ],
      pitfall: '“The teacher with his students are coming.” 应改为 is coming，因为谓语跟 the teacher 一致。',
      drills: [
        {
          q: 'Neither Tom nor his friends ___ ready for the trip.',
          options: ['is', 'are', 'was', 'has'],
          answer: 1,
          explain: 'neither...nor 遵循就近原则，最近的主语是 his friends，用 are。'
        },
        {
          q: 'The teacher, together with the students, ___ visiting the museum.',
          options: ['is', 'are', 'were', 'have'],
          answer: 0,
          explain: 'together with 不影响主语，真正的主语是 the teacher，用 is。'
        }
      ]
    },
    {
      id: 'comparison',
      title: '比较结构：倍数、than 与 the more...the more',
      level: '进阶',
      tag: '形容词',
      minutes: 6,
      intro: '比较级不只是加 -er。倍数怎么表达、比较级前能加什么词、the more...the more 怎么排，都有固定格式。',
      points: [
        {
          h: '倍数三种写法',
          body: 'A is three times as big as B；A is three times bigger than B；A is three times the size of B。三种都表示“A 是 B 的三倍大”。',
          eg: [
            ['This room is twice as large as that one.', '这个房间是那个房间的两倍大。'],
            ['This room is twice the size of that one.', '这个房间是那个房间的两倍大。']
          ]
        },
        {
          h: '比较级前可用 much/far/even/a lot',
          body: '比较级前可以加 much、far、a lot、even、a little 等表示程度，但不能用 very；very 只能修饰原级。',
          eg: [
            ['This room is much bigger than that one.', '这个房间比那个大得多。'],
            ['She is a little taller than me.', '她比我高一点。']
          ]
        },
        {
          h: 'the more..., the more...',
          body: '表示“越……就越……”，两个分句都用“the + 比较级”开头，注意语序和主谓一致。',
          eg: [
            ['The more you practice, the more confident you will become.', '你练得越多，就会越自信。'],
            ['The earlier you start, the better it is.', '越早开始越好。']
          ]
        }
      ],
      pitfall: '不要说 “very bigger”；表示程度用 much bigger。也不要说 “more easier”，easier 本身已经是比较级。',
      drills: [
        {
          q: 'This room is ___ than that one.',
          options: ['very bigger', 'much bigger', 'more bigger', 'most bigger'],
          answer: 1,
          explain: '比较级前用 much 表示程度，very 不能修饰比较级。'
        },
        {
          q: 'The more you practice, ___ you will become.',
          options: ['the confident', 'the more confident', 'more confident', 'most confident'],
          answer: 1,
          explain: 'the more..., the more... 结构，后半句也要用 the + 比较级。'
        }
      ]
    },
    {
      id: 'preposition',
      title: '介词搭配：动词、形容词后面的小词',
      level: '基础',
      tag: '搭配',
      minutes: 6,
      intro: '介词题看似靠语感，其实大多是固定搭配。把动词和形容词按“搭档”成组记，比单独背介词有效。',
      points: [
        {
          h: '动词 + 介词',
          body: 'depend on、belong to、look forward to、be used to、pay attention to、take part in、succeed in 等，介词是固定搭档。',
          eg: [
            ['It depends on the weather.', '这取决于天气。'],
            ['She succeeded in passing the exam.', '她成功通过了考试。']
          ]
        },
        {
          h: '形容词 + 介词',
          body: 'be good at、be interested in、be afraid of、be proud of、be responsible for、be full of、be different from 等。',
          eg: [
            ['He is good at playing the piano.', '他擅长弹钢琴。'],
            ['We are proud of our school.', '我们为学校感到骄傲。']
          ]
        },
        {
          h: '时间与地点介词',
          body: 'in + 月份/年份/季节/大地点；on + 具体某天/星期；at + 时刻/小地点。固定短语如 at night、in the morning、on Sunday morning 要单独记。',
          eg: [
            ['We will meet on Friday morning.', '我们星期五上午见。'],
            ['He arrived at the station at seven.', '他七点到达车站。']
          ]
        }
      ],
      pitfall: 'look forward to 的 to 是介词，后面接 doing，不接动词原形。',
      drills: [
        {
          q: 'I’m looking forward to ___ from you.',
          options: ['hear', 'hearing', 'heard', 'be heard'],
          answer: 1,
          explain: 'look forward to 中 to 是介词，后面接动名词 hearing。'
        },
        {
          q: 'She is good ___ playing the piano.',
          options: ['at', 'in', 'on', 'for'],
          answer: 0,
          explain: '固定搭配 be good at doing sth，表示“擅长做某事”。'
        }
      ]
    },
    {
      id: 'conjunction',
      title: '连词逻辑：because/so、although/but 只能留一个',
      level: '基础',
      tag: '连接',
      minutes: 5,
      intro: '英语句子讲究“一个连接词管一层关系”。汉语里成对出现的“因为……所以……”“虽然……但是……”，英语里不能照搬。',
      points: [
        {
          h: '因果与让步不重复',
          body: 'because 和 so 不同时用；although/though 和 but 不同时用。保留一个连接词，句子关系依然清楚。',
          eg: [
            ['Because it was raining, we stayed inside.', '因为下雨，我们待在室内。'],
            ['It was raining, so we stayed inside.', '下雨了，所以我们待在室内。']
          ]
        },
        {
          h: '并列连词与从属连词',
          body: 'and/but/or/so 连接并列句；because/although/if/when/while 引导从属句。一个句子不能只靠逗号连接两个完整句子。',
          eg: [
            ['He is young, but he knows a lot.', '他年纪小，但懂得很多。'],
            ['Although he is young, he knows a lot.', '虽然他年纪小，但懂得很多。']
          ]
        },
        {
          h: '连接副词不是连词',
          body: 'however、therefore、besides 是连接副词，前面通常用句号或分号，不能像 but/so 一样直接用逗号连接两个句子。',
          eg: [
            ['It was raining; therefore, we stayed inside.', '下雨了，因此我们待在室内。'],
            ['He was tired. However, he kept working.', '他很累，然而他继续工作。']
          ]
        }
      ],
      pitfall: '“Although he is young, but he knows a lot.” 是错句，删掉 but。',
      drills: [
        {
          q: '___ he is young, he knows a lot.',
          options: ['Although', 'But', 'Because', 'So'],
          answer: 0,
          explain: '前后是让步关系，用 Although 引导；后面不能再加 but。'
        },
        {
          q: 'It was raining, ___ we stayed inside.',
          options: ['so', 'because', 'although', 'but'],
          answer: 0,
          explain: '前因后果，用 so 连接结果；because 会引出原因，逻辑相反。'
        }
      ]
    },
    {
      id: 'reported-speech',
      title: '间接引语：时态后移与陈述语序',
      level: '进阶',
      tag: '引语',
      minutes: 6,
      intro: '把别人说的话转述出来，要注意三件事：时态要不要后移、人称和时间地点怎么变、疑问句要改回陈述语序。',
      points: [
        {
          h: '时态后移',
          body: '主句是过去时，间接引语通常把时态往过去推一格：一般现在→一般过去，一般过去→过去完成，will→would，can→could。',
          eg: [
            ['He said he was busy then.', '他说他当时很忙。'],
            ['She said she would come the next day.', '她说她第二天会来。']
          ]
        },
        {
          h: '人称、时间、地点要跟着变',
          body: 'now→then，today→that day，tomorrow→the next day，yesterday→the day before，here→there，this→that。',
          eg: [
            ['She said she had finished it the day before.', '她说她前一天已经完成了。'],
            ['He said he would meet me there.', '他说他会在那里见我。']
          ]
        },
        {
          h: '疑问句改陈述语序',
          body: '一般疑问句用 if/whether 引导；特殊疑问句保留疑问词，但把语序改成陈述句。',
          eg: [
            ['She asked me if I had finished.', '她问我是否完成了。'],
            ['He asked me where I lived.', '他问我住在哪里。']
          ]
        }
      ],
      pitfall: '“He asked me where did I live.” 是错句；间接引语里用 where I lived。',
      drills: [
        {
          q: 'He said he ___ busy then.',
          options: ['is', 'was', 'has been', 'will be'],
          answer: 1,
          explain: '主句 said 是过去时，间接引语把 is 后移为 was。'
        },
        {
          q: 'She asked me ___ I had finished the work.',
          options: ['that', 'if', 'what', 'because'],
          answer: 1,
          explain: '原句是一般疑问句，转述时用 if/whether 引导，并改陈述语序。'
        }
      ]
    },
    {
      id: 'articles',
      title: '冠词：a/an/the 与零冠词',
      level: '基础',
      tag: '名词',
      minutes: 5,
      intro: '冠词只有三个，却最容易丢分。a/an 看读音，the 看是否特指，零冠词看是否是泛指或固定搭配。',
      points: [
        {
          h: 'a/an 看的是读音',
          body: '以辅音音素开头用 a，以元音音素开头用 an。注意 hour、honest 虽然以 h 开头，但 h 不发音，用 an；useful、university 以辅音音素开头，用 a。',
          eg: [
            ['He is an honest boy.', '他是一个诚实的男孩。'],
            ['This is a useful book.', '这是一本有用的书。']
          ]
        },
        {
          h: 'the 表示特指',
          body: '上文提到过、双方都知道、独一无二、最高级和序数词前，通常用 the。',
          eg: [
            ['The sun rises in the east.', '太阳从东方升起。'],
            ['She is the tallest girl in our class.', '她是我们班最高的女孩。']
          ]
        },
        {
          h: '零冠词：泛指与固定搭配',
          body: '泛指复数或不可数名词、三餐、球类、学科、语言前通常不加冠词；固定短语如 go to school、at night、by bus 也要整体记。',
          eg: [
            ['I have breakfast at seven.', '我七点吃早饭。'],
            ['He plays basketball after school.', '他放学后打篮球。']
          ]
        }
      ],
      pitfall: 'an 不是看字母，而是看读音：an hour，但 a university。',
      drills: [
        {
          q: 'He is ___ honest boy.',
          options: ['a', 'an', 'the', '不填'],
          answer: 1,
          explain: 'honest 的 h 不发音，开头是元音音素，用 an。'
        },
        {
          q: 'She plays ___ piano every day.',
          options: ['a', 'an', 'the', '不填'],
          answer: 2,
          explain: '演奏乐器前通常用定冠词 the：play the piano。'
        }
      ]
    },
    {
      id: 'modal-speculation',
      title: '情态动词表推测：must、may、can’t',
      level: '进阶',
      tag: '情态',
      minutes: 6,
      intro: '情态动词除了“能、必须、应该”，还常用来“猜”。肯定程度从高到低：must > may > might；否定“不可能”用 can’t。',
      points: [
        {
          h: '对现在的推测',
          body: 'must be“一定是”，may/might be“可能是”，can’t be“不可能是”。注意 must 表推测时只用于肯定句，否定推测用 can’t。',
          eg: [
            ['The light is on; he must be at home.', '灯亮着，他一定在家。'],
            ['He can’t be at home; I saw him at school.', '他不可能在家，我在学校看见他了。']
          ]
        },
        {
          h: '对过去的推测',
          body: 'must have done“过去一定做过”，may/might have done“过去可能做过”，can’t have done“过去不可能做过”。',
          eg: [
            ['She must have forgotten the time.', '她一定是忘了时间。'],
            ['He can’t have finished so quickly.', '他不可能这么快就完成了。']
          ]
        },
        {
          h: 'should have done 与 needn’t have done',
          body: 'should have done 表示“本该做却没做”；needn’t have done 表示“本不必做却做了”。两者都带后悔或责备语气。',
          eg: [
            ['You should have told me earlier.', '你本该早点告诉我。'],
            ['You needn’t have bought so much food.', '你本不必买这么多食物。']
          ]
        }
      ],
      pitfall: '否定推测用 can’t，不用 mustn’t；mustn’t 表示“禁止”，不是“不可能”。',
      drills: [
        {
          q: 'The light is on; he ___ at home.',
          options: ['must be', 'can’t be', 'must have been', 'should be'],
          answer: 0,
          explain: '灯亮着是现在的证据，对现在作肯定推测用 must be。'
        },
        {
          q: 'You ___ the door; I had a key.',
          options: ['needn’t have locked', 'mustn’t have locked', 'shouldn’t lock', 'needn’t lock'],
          answer: 0,
          explain: '“本不必锁却锁了”用 needn’t have done。'
        }
      ]
    }
  ];

  window.ShunshiGrammarExtra = { topics };
})();
