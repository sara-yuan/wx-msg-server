const express = require('express')
const crypto = require('crypto')
const xml2js = require('xml2js')
const axios = require('axios')

const app = express()
const PORT = process.env.PORT || 80
const TOKEN = 'wechatrm'

// 原始 body 读取（微信推送是 XML）
app.use(express.text({ type: 'text/xml' }))
app.use(express.text({ type: 'application/xml' }))
app.use(express.text({ type: '*/*' }))

// ===== 微信服务器验证（GET）=====
app.get('/wxmsg', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query
  const arr = [TOKEN, timestamp, nonce].sort()
  const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex')
  if (hash === signature) {
    console.log('微信验证通过')
    res.send(echostr)
  } else {
    console.log('微信验证失败')
    res.status(403).send('Forbidden')
  }
})

// ===== 接收微信消息推送（POST）=====
app.post('/wxmsg', async (req, res) => {
  // 必须先回 success，否则微信会重试
  res.send('success')

  const body = req.body
  console.log('收到原始消息:', body)

  try {
    const parsed = await xml2js.parseStringPromise(body, { explicitArray: false })
    const msg = parsed.xml
    console.log('解析后消息:', JSON.stringify(msg))

    const openid = msg.FromUserName
    const appid = msg.ToUserName
    const msgType = msg.MsgType

    // 视频号视频转发消息
    if (msgType === 'miniprogrampage' || msg.FinderFeed) {
      const feed = msg.FinderFeed || {}

      // 尝试直接从消息体拿 cdnVideoUrl
      const videoUrl = feed.cdnVideoUrl || feed.CdnVideoUrl || ''
      const feedId = feed.feedId || feed.FeedId || ''
      const username = feed.username || feed.Username || ''

      console.log('feedId:', feedId, 'cdnVideoUrl:', videoUrl)

      if (videoUrl) {
        await sendTextMsg(appid, openid, '✅ 解析成功！复制下方链接在浏览器打开保存：\n\n' + videoUrl)
      } else {
        await sendTextMsg(appid, openid, '⚠️ 暂时无法自动解析此视频，请在小程序内手动粘贴链接。\nfeedId: ' + feedId)
      }
    } else if (msgType === 'text') {
      await sendTextMsg(appid, openid, '请打开小程序，粘贴视频链接进行去水印。支持即梦/豆包/抖音/小红书/快手。')
    } else {
      console.log('未处理消息类型:', msgType)
    }

  } catch (err) {
    console.error('消息处理出错:', err.message)
  }
})

// ===== 发送客服文本消息 =====
async function sendTextMsg(appid, openid, content) {
  try {
    // 用微信云托管免鉴权调用接口
    const res = await axios.post(
      'https://api.weixin.qq.com/cgi-bin/message/custom/send',
      {
        touser: openid,
        msgtype: 'text',
        text: { content }
      },
      {
        headers: {
          'X-WX-SERVICE': process.env.X_WX_SERVICE || '',
          'access_token': 'CLOUD_ACCESS_TOKEN'  // 云托管环境自动注入，无需手动获取
        }
      }
    )
    console.log('客服消息发送结果:', res.data)
  } catch (err) {
    console.error('客服消息发送失败:', err.message)
  }
}

// 健康检查
app.get('/', (req, res) => res.send('OK'))

app.listen(PORT, () => {
  console.log('服务启动，端口:', PORT)
})
